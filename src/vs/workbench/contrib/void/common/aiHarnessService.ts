/*--------------------------------------------------------------------------------------
 *  AI Harness — VectorDB rule/role loading service
 *  Loads base rules and role prompts from the harness MCP server defined in product.json.
 *  This service is the guardrail: it ensures every AI request includes team rules.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IMCPService } from './mcpService.js';

// ─── AI Harness: product.json shape ───
interface AiHarnessConfig {
	mcpUrl?: string;
	mcpServerName?: string;
	mcpApiKey?: string;
	defaultProvider?: string;
	defaultApiKey?: string;
	defaultModel?: string;
}

export interface IAiHarnessService {
	readonly _serviceBrand: undefined;

	/** Load base rules from vectorDB (cached after first call) */
	loadBaseRules(): Promise<string | undefined>;

	/** Load role prompt by slash-command name (e.g. 'develop', 'review') */
	loadRoleByCommand(roleName: string): Promise<string | undefined>;

	/** Auto-detect role from user message text */
	detectRole(userMessage: string): Promise<{ role: string; prompt: string } | undefined>;

	/** Get the harness config from product.json */
	getConfig(): AiHarnessConfig;
}

export const IAiHarnessService = createDecorator<IAiHarnessService>('aiHarnessService');

const ROLE_COMMANDS = new Set(['ask', 'develop', 'review', 'security', 'plan', 'onboard', 'infinite']);

class AiHarnessService extends Disposable implements IAiHarnessService {
	readonly _serviceBrand: undefined;

	private _baseRulesCache: string | undefined;
	private _baseRulesLoaded = false;
	private _rolePromptCache = new Map<string, string>();
	private readonly _config: AiHarnessConfig;

	constructor(
		@IProductService private readonly productService: IProductService,
		@IMCPService private readonly mcpService: IMCPService,
	) {
		super();
		this._config = (this.productService as any).aiHarness ?? {};
	}

	getConfig(): AiHarnessConfig {
		return this._config;
	}

	async loadBaseRules(): Promise<string | undefined> {
		if (this._baseRulesLoaded) { return this._baseRulesCache; }

		const serverName = this._config.mcpServerName;
		if (!serverName) { this._baseRulesLoaded = true; return undefined; }

		try {
			const result = await this.mcpService.callMCPTool({
				serverName,
				toolName: 'doc_search',
				params: { query: '작업 규칙 문서 참조 스테이징 브랜치', domain: '규칙', top_k: 3 },
			});

			const text = this.mcpService.stringifyResult(result.result);
			const parsed = JSON.parse(text);
			if (!parsed.results || parsed.results.length === 0) {
				this._baseRulesLoaded = true;
				return undefined;
			}

			this._baseRulesCache = parsed.results.map((r: any) => r.content).join('\n\n');
			this._baseRulesLoaded = true;
			return this._baseRulesCache;
		} catch {
			this._baseRulesLoaded = true;
			return undefined;
		}
	}

	async loadRoleByCommand(roleName: string): Promise<string | undefined> {
		if (!ROLE_COMMANDS.has(roleName)) { return undefined; }

		const cached = this._rolePromptCache.get(roleName);
		if (cached) { return cached; }

		const serverName = this._config.mcpServerName;
		if (!serverName) { return undefined; }

		try {
			const result = await this.mcpService.callMCPTool({
				serverName,
				toolName: 'doc_search',
				params: { query: `${roleName} 역할 규칙`, domain: 'AI-역할', top_k: 3 },
			});

			const text = this.mcpService.stringifyResult(result.result);
			const parsed = JSON.parse(text);
			if (!parsed.results || parsed.results.length === 0) { return undefined; }

			const rolePrompt = parsed.results.map((r: any) => r.content).join('\n\n');
			this._rolePromptCache.set(roleName, rolePrompt);
			return rolePrompt;
		} catch {
			return undefined;
		}
	}

	async detectRole(userMessage: string): Promise<{ role: string; prompt: string } | undefined> {
		const serverName = this._config.mcpServerName;
		if (!serverName) { return undefined; }

		try {
			const result = await this.mcpService.callMCPTool({
				serverName,
				toolName: 'doc_role_detect',
				params: { query: userMessage },
			});

			const text = this.mcpService.stringifyResult(result.result);
			const parsed = JSON.parse(text);
			if (parsed.confidence !== 'high' || !parsed.recommended) { return undefined; }

			const roleName = parsed.recommended;
			const cached = this._rolePromptCache.get(roleName);
			if (cached) { return { role: roleName, prompt: cached }; }

			const rolePrompt = parsed.candidates?.[0]?.prompt;
			if (!rolePrompt) { return undefined; }

			this._rolePromptCache.set(roleName, rolePrompt);
			return { role: roleName, prompt: rolePrompt };
		} catch {
			return undefined;
		}
	}
}

registerSingleton(IAiHarnessService, AiHarnessService, InstantiationType.Delayed);
