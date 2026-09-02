(() => {
  "use strict";

  const ACTIVE_KEY = "design-copilot-v2-active";
  const HISTORY_KEY = "design-copilot-v2-history";
  const VERSION = 2;
  const PLAN_STATUS = new Set(["pending", "running", "completed", "needs-input", "needs-approval", "blocked"]);

  const deepClone = (value) => JSON.parse(JSON.stringify(value));
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const nowLabel = () => new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const slug = (value = "design-copilot") => String(value).trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-").replace(/^-+|-+$/g, "") || "design-copilot";

  const PRESETS = {
    adhd: {
      label: "ADHD 儿童低认知负荷阅读（Golden Path）",
      projectName: "Focus Reader",
      productDescription: "为 8–12 岁 ADHD 儿童设计一个低认知负荷阅读产品，帮助孩子开始阅读、在分心后恢复，并获得清晰的完成反馈。",
      targetUsers: "8–12 岁 ADHD 儿童，以及陪伴阅读的家长",
      platform: "iOS / iPadOS",
      goal: "降低开始阅读和中断恢复的认知成本，提高一次阅读任务的完成率",
      constraints: "",
      additionalContext: "",
    },
    commerce: {
      label: "移动电商首页（V1 Preset）",
      projectName: "Weekend Market",
      productDescription: "设计一个移动电商首页，帮助用户发现限时商品并快速进入购买路径。",
      targetUsers: "18–35 岁移动购物用户",
      platform: "iOS / Android",
      goal: "缩短从发现商品到进入结算的路径",
      constraints: "保留现有分类与购物车入口；首屏不超过两个促销焦点",
      additionalContext: "用户多在通勤和午休的碎片时间浏览",
    },
    productivity: {
      label: "效率工作台（V1 Preset）",
      projectName: "Daily Workbench",
      productDescription: "设计一个个人效率工作台，集中呈现今日重点、即将到期任务和项目入口。",
      targetUsers: "需要管理多个并行项目的知识工作者",
      platform: "Responsive Web",
      goal: "让用户在一分钟内判断今天最重要的工作",
      constraints: "兼容 1280px 桌面端；沿用现有任务数据模型",
      additionalContext: "用户每天早晨和午后各检查一次工作台",
    },
  };

  const PLAN_BLUEPRINT = [
    ["brief", "Project Brief", "理解目标、用户、问题与约束"],
    ["userInsight", "User Insight", "整理目标、行为、痛点与认知需要"],
    ["experiencePrinciples", "Experience Principles", "将洞察转化为设计原则"],
    ["userFlow", "User Flow", "定义核心任务路径"],
    ["screenStructure", "Screen Structure", "拆解核心页面和信息结构"],
    ["prototype", "Prototype", "生成并迭代可切换 Mock Prototype"],
    ["review", "AI Review", "检查六类质量维度并支持真实修复"],
  ];

  const ARTIFACT_LABELS = {
    brief: "Project Brief",
    userInsight: "User Insight",
    experiencePrinciples: "Experience Principles",
    userFlow: "User Flow",
    screenStructure: "Screen Structure",
    prototypeV1: "Prototype V1",
    reviewV1: "AI Review · V1",
    prototypeV2: "Prototype V2",
    reviewV2: "AI Review · V2",
  };

  const STAGE_BY_STATUS = {
    creating: 0,
    "needs-input": 0,
    "brief-approval": 1,
    "user-insight": 2,
    "experience-principles": 2,
    "user-flow": 2,
    "screen-structure": 2,
    "prototype-v1": 2,
    "review-v1": 3,
    "prototype-v2": 2,
    "review-v2": 3,
    complete: 3,
    stopped: 0,
  };

  const CURRENT_ARTIFACT = {
    "brief-approval": "brief",
    "needs-input": "brief",
    "user-insight": "userInsight",
    "experience-principles": "experiencePrinciples",
    "user-flow": "userFlow",
    "screen-structure": "screenStructure",
    "prototype-v1": "prototypeV1",
    "review-v1": "reviewV1",
    "prototype-v2": "prototypeV2",
    "review-v2": "reviewV2",
  };

  class LocalDemoProvider {
    classify(context) {
      const project = context?.project || context || {};
      const source = `${project.productDescription || ""} ${project.targetUsers || ""} ${project.goal || ""}`;
      if (/ADHD|注意力|阅读|儿童|绘本|read/i.test(source)) return "reading";
      if (/电商|商城|商品|订单|库存|商家|commerce|order|inventory/i.test(source)) return "commerce";
      if (/效率|任务|项目|工作台|协作|日程|productivity|task/i.test(source)) return "productivity";
      return "generic";
    }

    detectMissingContext(project) {
      const candidates = [
        ["productDescription", "这个产品需要解决的主要使用场景是什么？", "例如：用户在什么情境下遇到什么问题"],
        ["targetUsers", "主要用户是谁？请补充角色、能力或使用特征。", "例如：高频使用后台的电商运营人员"],
        ["goal", "这次设计任务最重要的成功目标是什么？", "例如：把关键任务完成时间缩短 30%"],
        ["constraints", "有哪些必须遵守的内容、交互或技术限制？", "例如：沿用现有数据模型并满足 WCAG AA"],
        ["platform", "首要交付平台是什么？", "例如：1280px 以上桌面 Web"],
      ];

      if (/ADHD|注意力|低认知|阅读/i.test(project.productDescription || "") && !project.additionalContext?.trim()) {
        candidates.push(["additionalContext", "孩子分心或暂停后，产品应该怎样帮助他继续？", "例如：保留阅读位置，并用一个明确按钮恢复" ]);
      }

      return candidates
        .filter(([field]) => !String(project[field] || "").trim())
        .slice(0, 3)
        .map(([field, prompt, placeholder]) => ({ id: uid(), field, prompt, placeholder }));
    }

    generateBrief(project, missingContext) {
      return {
        goal: project.goal || "待补充",
        targetUser: project.targetUsers || "待补充",
        productType: /阅读|绘本|book/i.test(project.productDescription || "") ? "低认知负荷数字阅读产品" : "数字产品体验",
        platform: project.platform || "待补充",
        mainProblem: project.productDescription || "待补充产品问题与主要场景",
        constraints: project.constraints || "待补充",
        missingContext: missingContext.map((item) => item.prompt),
        approved: false,
        revision: 1,
      };
    }

    generateUserInsight(project) {
      const isReading = /ADHD|注意力|阅读|儿童/i.test(`${project.productDescription} ${project.targetUsers}`);
      if (!isReading) {
        return {
          goals: ["快速理解当前最重要的任务", "以尽量少的步骤完成主要操作"],
          behaviors: ["在碎片时间快速扫读", "依赖明确反馈判断任务状态"],
          painPoints: ["入口过多时难以判断优先级", "中断后难以恢复上下文"],
          cognitiveNeeds: ["单一主行动", "稳定的信息位置", "即时且克制的状态反馈"],
          implications: ["首屏只突出一个主任务", "为中断恢复提供直接入口"],
          generation: 1,
        };
      }
      return {
        goals: ["独立选择一本合适的书", "完成短时阅读并感到进度可见", "分心后无压力地回到原位置"],
        behaviors: ["先扫描图片和短标题，再决定是否进入", "遇到长段文字会切换任务", "需要家长偶尔协助，但不希望被持续监督"],
        painPoints: ["选择过多会延迟开始", "阅读控制项同时出现会争夺注意力", "暂停后找不到上次位置容易放弃"],
        cognitiveNeeds: ["每屏一个清晰主任务", "短句与可预测的层级", "低刺激反馈和单步恢复"],
        implications: ["首页推荐控制在三个以内", "阅读页把继续阅读设为唯一主行动", "完成反馈强调过程而非排名"],
        generation: 1,
      };
    }

    generateExperiencePrinciples() {
      return {
        principles: [
          { title: "One decision at a time", detail: "每个关键页面只要求用户做一个主要决定，次级选项延后出现。" },
          { title: "Return without penalty", detail: "暂停与分心是正常状态；恢复路径始终可见，不使用失败语言。" },
          { title: "Progress you can feel", detail: "用短章节、位置记忆和柔和完成反馈，让进度具体可感。" },
          { title: "Calm, not empty", detail: "通过稳定结构和适量视觉线索降低负荷，而不是简单删光内容。" },
        ],
        generation: 1,
      };
    }

    generateUserFlowLegacy() {
      return {
        happyPath: ["Home", "Choose Book", "Reading", "Pause / Distraction", "Resume", "Complete", "Feedback"],
        recoveryRule: "任何中断状态都保存页码、阅读时长和显示设置；下一次只需一次操作即可恢复。",
        decisions: [
          { at: "Home", question: "继续上次阅读？", yes: "Resume", no: "Choose Book" },
          { at: "Reading", question: "超过 30 秒无操作？", yes: "显示低干扰恢复提示", no: "继续阅读" },
        ],
        generation: 1,
      };
    }

    generateScreenStructureLegacy() {
      return {
        screens: [
          { name: "Home", purpose: "让孩子用一个决定开始阅读", primary: "继续阅读 / 今日推荐", sections: ["问候与连续阅读", "3 个推荐", "简化底部导航"] },
          { name: "Reading", purpose: "维持注意力并支持自然中断", primary: "阅读内容与继续阅读", sections: ["章节进度", "短段正文", "暂停 / 字号 / 音频"] },
          { name: "Progress / Completion", purpose: "确认完成并提供温和反馈", primary: "完成反馈", sections: ["本次阅读", "过程型成就", "返回首页"] },
        ],
        sharedRules: ["核心操作触控区 ≥ 48px", "正文行长 20–28 个中文字符", "不使用自动播放或高频闪烁"],
        generation: 1,
      };
    }

    generatePrototypeLegacy(version = 1, previous = null) {
      if (version === 2 && previous) {
        const next = deepClone(previous);
        next.version = "V2";
        next.createdAt = new Date().toISOString();
        next.settings.homeChoiceCount = 3;
        next.settings.touchTarget = 52;
        next.settings.resumePriority = "primary";
        next.settings.recoveryCopy = "继续第 4 页";
        next.appliedChanges = ["把恢复阅读提升为页面唯一主按钮", "触控区域从 40px 扩大到 52px", "首页推荐入口从 6 个收敛为 3 个"];
        return next;
      }
      return {
        version: "V1",
        createdAt: new Date().toISOString(),
        settings: {
          homeChoiceCount: 6,
          touchTarget: 40,
          resumePriority: "secondary",
          recoveryCopy: "返回阅读",
        },
        strategyMap: [
          ["One decision at a time", "首页今日阅读卡"],
          ["Return without penalty", "阅读页暂停状态"],
          ["Progress you can feel", "完成页阅读进度"],
        ],
        appliedChanges: [],
        generation: 1,
      };
    }

    reviewPrototypeLegacy(prototype, round = 1) {
      const fixed = prototype.version === "V2" && prototype.settings.resumePriority === "primary" && prototype.settings.touchTarget >= 48;
      return {
        round,
        prototypeVersion: prototype.version,
        createdAt: new Date().toISOString(),
        summary: fixed ? "关键恢复路径已修复，六个检查维度均达到本轮 MVP 标准。" : "整体结构可用，但阅读中断后的恢复入口不够明确，需要一次真实迭代。",
        issues: [
          { id: `hierarchy-${round}`, category: "Information Hierarchy", severity: "low", screen: "Home", problem: "主任务层级清楚。", reason: "今日阅读卡与次级入口保持足够对比。", recommendation: "保持单一主行动。", status: "pass" },
          { id: `cognitive-${round}`, category: "Cognitive Load", severity: fixed ? "low" : "medium", screen: "Home", problem: fixed ? "首页选择数量已收敛。" : "首屏同时出现 6 个可选入口。", reason: fixed ? "三个入口降低首次决策成本。" : "过多同级选择会延迟开始阅读。", recommendation: "将首屏核心选择控制在 3 个。", status: fixed ? "resolved" : "pass" },
          { id: "resume-clarity", category: "Interaction Clarity", severity: fixed ? "low" : "high", screen: "Reading · Pause", problem: fixed ? "恢复入口清楚且可一次操作完成。" : "分心或暂停后，“返回阅读”与其他控制项同级。", reason: fixed ? "主按钮与 52px 触控区明确支持恢复。" : "孩子需要重新判断哪个操作能回到原位置。", recommendation: "把“继续第 4 页”设为唯一主按钮，并扩大触控区到至少 48px。", status: fixed ? "resolved" : "open" },
          { id: `accessibility-${round}`, category: "Accessibility", severity: "low", screen: "All", problem: "文本对比度与字号符合当前原型目标。", reason: "正文和操作标签均保持稳定对比。", recommendation: "后续进行真实设备读屏测试。", status: "pass" },
          { id: `completion-${round}`, category: "Task Completion", severity: "low", screen: "Progress", problem: "完成状态与返回路径明确。", reason: "反馈强调本次进度，并提供返回首页。", recommendation: "保留过程型反馈。", status: "pass" },
          { id: `consistency-${round}`, category: "Consistency", severity: "low", screen: "All", problem: "页面结构与行动语言一致。", reason: "三个核心页面使用相同的层级与按钮逻辑。", recommendation: "保持当前组件规则。", status: "pass" },
        ],
      };
    }

    reviseArtifactLegacy(key, value, instruction) {
      const revised = deepClone(value);
      revised.agentRevision = instruction;
      revised.revisionUpdatedAt = new Date().toISOString();
      revised.generation = (revised.generation || 1) + 1;
      if (key === "experiencePrinciples" && revised.principles?.length) {
        revised.principles[0].detail = `${revised.principles[0].detail} 调整说明：${instruction}`;
      } else if (key === "userInsight" && revised.implications?.length) {
        revised.implications[0] = `${revised.implications[0]}（已结合反馈：${instruction}）`;
      } else if (key === "userFlow") {
        revised.recoveryRule = `${revised.recoveryRule} 补充：${instruction}`;
      } else if (key === "screenStructure" && revised.sharedRules?.length) {
        revised.sharedRules.push(`Agent revision：${instruction}`);
      }
      return revised;
    }

    understandProject(context) {
      const project = context.project || context;
      const missingContext = this.detectMissingContext(project);
      return {
        brief: this.generateBrief(project, missingContext),
        missingContext,
        analysisSummary: missingContext.length ? `检测到 ${missingContext.length} 项关键信息缺失。` : "关键信息完整，可以进入 Brief Approval。",
      };
    }

    generateInsights(context) {
      const project = context.project || context;
      const kind = this.classify(context);
      if (kind === "commerce") return {
        goals: ["快速发现需要处理的异常订单", "判断库存与履约风险", "批量完成高频运营动作"],
        behaviors: ["先扫描数字与异常状态", "筛选后批量处理同类任务", "频繁切换订单和库存上下文"],
        painPoints: ["异常信息分散在多个模块", "批量操作缺少影响范围确认", "高峰期状态更新滞后"],
        cognitiveNeeds: ["风险优先的信息层级", "可撤销的批量操作", "清晰的处理结果反馈"],
        implications: ["首屏突出待处理异常而不是总量", "批量动作显示影响对象数量", "订单状态变化后保留筛选上下文"],
      };
      if (kind === "productivity") return {
        goals: ["快速确定今天最重要的工作", "保持跨项目任务的连续性", "在中断后恢复当前上下文"],
        behaviors: ["早晨规划当天重点", "在会议与深度工作之间切换", "用完成反馈调整后续安排"],
        painPoints: ["任务来源分散", "优先级标签过多", "中断后需要重新寻找资料"],
        cognitiveNeeds: ["单一今日焦点", "稳定的任务上下文", "轻量而即时的进度反馈"],
        implications: ["今日只突出三个关键任务", "任务详情保留项目资料", "完成后直接建议下一步"],
      };
      return this.generateUserInsight(project);
    }

    generatePrinciples(context) {
      const kind = this.classify(context);
      if (kind === "commerce") return { principles: [
        { title: "Risk before volume", detail: "先呈现需要行动的异常，再呈现总体业务数字。" },
        { title: "Bulk with confidence", detail: "批量操作显示对象数量、影响和撤销路径。" },
        { title: "Preserve operator context", detail: "跨订单、库存和履约页面保留筛选状态。" },
        { title: "Status is a contract", detail: "每次状态变化都有时间、责任人与结果反馈。" },
      ] };
      if (kind === "productivity") return { principles: [
        { title: "Focus is finite", detail: "每个时段只突出一个焦点与少量可执行任务。" },
        { title: "Context travels", detail: "任务切换时保留项目资料、最近动作与下一步。" },
        { title: "Plans can bend", detail: "重新排序不会惩罚用户，并更新剩余计划。" },
        { title: "Progress stays quiet", detail: "反馈帮助判断进度，不用高刺激庆祝打断工作。" },
      ] };
      if (kind === "reading") return this.generateExperiencePrinciples(context);
      return { principles: [
        { title: "Primary task first", detail: `围绕“${context?.project?.goal || "完成核心任务"}”建立唯一清晰的主行动。` },
        { title: "Context survives interruption", detail: "保存用户输入、位置和最近决策，让中断后的恢复不需要重新判断。" },
        { title: "Consequences stay visible", detail: "关键操作前说明影响，操作后明确结果、异常与下一步。" },
        { title: "Complexity follows need", detail: "默认只呈现当前任务需要的信息，细节按需展开。" },
      ] };
    }

    generateUserFlow(context) {
      const kind = this.classify(context);
      if (kind === "commerce") return {
        happyPath: ["Operations Overview", "Review Alert", "Open Orders", "Select Orders", "Apply Bulk Action", "Confirm Impact", "Track Result"],
        recoveryRule: "保留筛选器、已选订单和批量操作草稿；返回时重新校验实时状态。",
        decisions: [
          { at: "Review Alert", question: "需要立即处理？", yes: "Open affected orders", no: "Assign or snooze" },
          { at: "Confirm Impact", question: "状态是否仍可修改？", yes: "Apply action", no: "Remove conflicts and explain" },
        ],
      };
      if (kind === "productivity") return {
        happyPath: ["Today", "Choose Focus", "Open Task", "Work Session", "Pause / Switch", "Resume", "Complete", "Plan Next"],
        recoveryRule: "保存任务上下文、计时与最近资料；恢复时先显示未完成的下一步。",
        decisions: [
          { at: "Today", question: "已有未完成焦点？", yes: "Resume focus", no: "Choose task" },
          { at: "Pause / Switch", question: "需要记录下一步？", yes: "Capture handoff note", no: "Pause directly" },
        ],
      };
      if (kind === "reading") return this.generateUserFlowLegacy();
      const task = context?.project?.goal || "完成主要任务";
      return {
        happyPath: ["Overview", "Choose Primary Task", "Review Context", "Take Action", "Confirm Result", "Continue or Exit"],
        recoveryRule: `保存“${task}”的当前进度、输入和最近决策；恢复时直接回到未完成步骤。`,
        decisions: [
          { at: "Overview", question: "是否存在未完成任务？", yes: "Resume task", no: "Choose primary task" },
          { at: "Confirm Result", question: "结果是否符合预期？", yes: "Continue or exit", no: "Review error and retry" },
        ],
      };
    }

    generateScreenStructure(context) {
      const kind = this.classify(context);
      if (kind === "commerce") return {
        screens: [
          { name: "Operations Overview", purpose: "让运营人员先处理风险", primary: "查看异常订单", sections: ["风险摘要", "待处理队列", "关键业务指标"] },
          { name: "Order Workbench", purpose: "筛选并批量处理订单", primary: "应用批量动作", sections: ["筛选与选择", "订单表格", "影响确认"] },
          { name: "Operation Result", purpose: "确认处理结果与冲突", primary: "继续处理剩余订单", sections: ["成功与失败", "冲突原因", "操作日志"] },
        ],
        sharedRules: ["风险状态不能只依赖颜色", "批量动作显示影响数量", "筛选与选择状态可恢复"],
      };
      if (kind === "productivity") return {
        screens: [
          { name: "Today", purpose: "确定当前焦点", primary: "继续今日重点", sections: ["当前焦点", "三个关键任务", "日程约束"] },
          { name: "Task Focus", purpose: "在一个上下文内完成任务", primary: "完成下一步", sections: ["任务目标", "相关资料", "暂停与切换"] },
          { name: "Progress", purpose: "确认完成并规划下一步", primary: "安排下一个焦点", sections: ["本次成果", "剩余计划", "下一步建议"] },
        ],
        sharedRules: ["今日焦点始终唯一", "任务切换保留上下文", "状态变化提供撤销"],
      };
      if (kind === "reading") return this.generateScreenStructureLegacy();
      return {
        screens: [
          { name: "Overview", purpose: "突出当前项目的首要任务", primary: context?.project?.goal || "开始主要任务", sections: ["任务状态", "主要入口", "最近上下文"] },
          { name: "Primary Task", purpose: "在完整上下文中执行核心操作", primary: "完成当前步骤", sections: ["目标与输入", "核心操作", "保存与退出"] },
          { name: "Result", purpose: "确认结果并提供可恢复的下一步", primary: "继续下一步", sections: ["结果摘要", "异常说明", "后续行动"] },
        ],
        sharedRules: ["主行动在各状态保持稳定", "状态变化不只依赖颜色", "输入和进度可恢复"],
      };
    }

    generatePrototype(context, options = {}) {
      const version = Number(options.version || 1);
      const previous = options.previous || null;
      if (version === 2 && previous) {
        const revised = deepClone(previous);
        revised.version = "V2";
        revised.settings.homeChoiceCount = 3;
        revised.settings.touchTarget = 52;
        revised.settings.resumePriority = "primary";
        revised.settings.recoveryCopy = revised.ui.primaryScreen.primaryAction;
        revised.appliedChanges = ["把恢复主任务提升为唯一主按钮", "触控区域扩大到 52px", "首页入口收敛为 3 个"];
        return revised;
      }
      const kind = this.classify(context);
      const catalog = {
        reading: {
          productLabel: "FOCUS READER", userName: "Milo", greeting: "下午好，Milo", homeTitle: "继续你的故事",
          continuation: { eyebrow: "FOREST STORY · 34%", title: "森林里的小秘密", meta: "第 2 章 · 上次读到第 4 页", action: "继续阅读" },
          recommendations: [["慢慢找路", "8 分钟", "sage"], ["云朵朋友", "6 分钟", "blue"], ["安静星球", "10 分钟", "sand"], ["树洞来信", "7 分钟", "rose"], ["小小灯塔", "9 分钟", "amber"], ["风的地图", "8 分钟", "slate"]],
          primaryScreen: { eyebrow: "CHAPTER 2 · 4 / 12", title: "小狐狸停在发光的树下", body: ["它听见叶子轻轻地说：慢一点，也可以找到路。"], pausedLabel: "READING PAUSED", pausedTitle: "阅读已暂停", primaryAction: "继续第 4 页", secondaryActions: ["听一听", "设置"] },
          progressScreen: { eyebrow: "READING COMPLETE", title: "你读完了一个章节", summary: "今天专注阅读了 8 分钟", stats: [["12", "pages"], ["1", "pause"], ["100%", "returned"]], action: "回到首页" },
          navigation: [["home", "首页"], ["reading", "阅读"], ["progress", "进度"]],
          strategyMap: [["One decision at a time", "继续阅读卡"], ["Return without penalty", "暂停恢复状态"], ["Progress you can feel", "章节完成反馈"]],
        },
        commerce: {
          productLabel: "SELLER OPS", userName: "运营团队", greeting: "早上好，运营团队", homeTitle: "先处理风险订单",
          continuation: { eyebrow: "12 ORDERS · HIGH RISK", title: "履约异常待处理", meta: "5 个地址问题 · 7 个库存冲突", action: "查看异常订单" },
          recommendations: [["待发货", "128 单", "blue"], ["库存预警", "9 SKU", "rose"], ["退款申请", "17 单", "sand"], ["物流超时", "6 单", "amber"], ["客户消息", "23 条", "sage"], ["促销计划", "3 个", "slate"]],
          primaryScreen: { eyebrow: "ORDER WORKBENCH", title: "已选择 12 个异常订单", body: ["8 个订单可立即重分配库存。", "4 个订单需要先联系客户。"], pausedLabel: "BULK ACTION READY", pausedTitle: "确认影响范围", primaryAction: "处理 8 个订单", secondaryActions: ["导出列表", "分配成员"] },
          progressScreen: { eyebrow: "OPERATION COMPLETE", title: "8 个订单已更新", summary: "4 个冲突订单保留在队列中", stats: [["8", "updated"], ["4", "conflicts"], ["2m", "saved"]], action: "继续处理" },
          navigation: [["home", "概览"], ["reading", "订单"], ["progress", "结果"]],
          strategyMap: [["Risk before volume", "异常订单主卡"], ["Bulk with confidence", "批量影响确认"], ["Status is a contract", "操作结果页"]],
        },
        productivity: {
          productLabel: "DAILY WORKBENCH", userName: "Alex", greeting: "早上好，Alex", homeTitle: "今天先完成一件事",
          continuation: { eyebrow: "CURRENT FOCUS · 42%", title: "完成研究摘要", meta: "下一步：整理三个关键发现", action: "继续当前焦点" },
          recommendations: [["研究摘要", "45 分钟", "blue"], ["设计评审", "14:30", "sage"], ["周报", "今天", "sand"], ["路线图", "明天", "rose"], ["用户回访", "3 人", "amber"], ["资料整理", "12 项", "slate"]],
          primaryScreen: { eyebrow: "FOCUS SESSION · 24 MIN", title: "整理三个关键发现", body: ["把访谈证据归入当前研究摘要。", "完成后更新设计评审议题。"], pausedLabel: "SESSION PAUSED", pausedTitle: "上下文已经保存", primaryAction: "继续专注", secondaryActions: ["记录下一步", "切换任务"] },
          progressScreen: { eyebrow: "TASK COMPLETE", title: "研究摘要已完成", summary: "下一个建议：准备 14:30 设计评审", stats: [["52m", "focus"], ["3", "findings"], ["1", "switch"]], action: "安排下一步" },
          navigation: [["home", "今日"], ["reading", "任务"], ["progress", "进度"]],
          strategyMap: [["Focus is finite", "当前焦点主卡"], ["Context travels", "暂停恢复状态"], ["Plans can bend", "完成后下一步"]],
        },
        generic: {
          productLabel: String(context?.project?.projectName || "NEW PRODUCT").toUpperCase(), userName: "目标用户", greeting: "欢迎回来", homeTitle: context?.project?.goal || "继续当前任务",
          continuation: { eyebrow: "CURRENT TASK", title: context?.project?.productDescription || "完成主要任务", meta: context?.project?.platform || "当前平台", action: "继续任务" },
          recommendations: [["主要任务", "优先", "blue"], ["最近内容", "继续", "sage"], ["待处理", "查看", "sand"], ["资源", "浏览", "rose"], ["活动", "最新", "amber"], ["设置", "管理", "slate"]],
          primaryScreen: { eyebrow: "PRIMARY TASK", title: context?.project?.goal || "完成主要任务", body: [context?.project?.productDescription || "根据项目需求完成核心操作。"], pausedLabel: "TASK PAUSED", pausedTitle: "当前进度已保存", primaryAction: "继续任务", secondaryActions: ["查看详情", "稍后处理"] },
          progressScreen: { eyebrow: "TASK COMPLETE", title: "主要任务已完成", summary: "结果已保存，可以继续下一步", stats: [["1", "completed"], ["0", "blocked"], ["100%", "saved"]], action: "返回概览" },
          navigation: [["home", "概览"], ["reading", "任务"], ["progress", "结果"]],
          strategyMap: [["Clear priority", "主要任务主卡"], ["Recoverable progress", "暂停恢复状态"], ["Visible outcome", "任务结果页"]],
        },
      };
      const source = catalog[kind] || catalog.generic;
      const ui = {
        ...source,
        recommendations: source.recommendations.map(([title, subtitle, tone]) => ({ title, subtitle, tone })),
        progressScreen: { ...source.progressScreen, stats: source.progressScreen.stats.map(([value, label]) => ({ value, label })) },
        navigation: source.navigation.map(([key, label]) => ({ key, label })),
      };
      return {
        version: "V1",
        settings: { homeChoiceCount: 6, touchTarget: 40, resumePriority: "secondary", recoveryCopy: ui.primaryScreen.primaryAction },
        ui,
        strategyMap: source.strategyMap.map(([principle, element]) => ({ principle, element })),
        appliedChanges: [],
      };
    }

    reviewPrototype(context, prototype, options = {}) {
      const round = Number(options.round || 1);
      const fixed = prototype.version === "V2" && prototype.settings.resumePriority === "primary" && prototype.settings.touchTarget >= 48;
      const action = prototype.ui?.primaryScreen?.primaryAction || "主要任务";
      return {
        summary: fixed ? "关键任务恢复路径已修复，六个维度通过。" : "整体结构可用，但中断后的主任务恢复入口需要优化。",
        issues: [
          { category: "Information Hierarchy", severity: "low", screen: prototype.ui?.navigation?.[0]?.label || "Home", problem: "主任务层级清楚。", reason: "主卡与次级入口保持对比。", recommendation: "保持单一主行动。", status: "pass" },
          { category: "Cognitive Load", severity: fixed ? "low" : "medium", screen: "Home", problem: fixed ? "首页选择已收敛。" : "首屏出现 6 个同级入口。", reason: fixed ? "三个入口降低决策成本。" : "同级选择过多会延迟开始任务。", recommendation: "将首屏核心选择控制在 3 个。", status: fixed ? "resolved" : "pass" },
          { category: "Interaction Clarity", severity: fixed ? "low" : "high", screen: prototype.ui?.navigation?.[1]?.label || "Primary", problem: fixed ? "恢复入口可一次完成。" : `中断后“${action}”与其他操作同级。`, reason: fixed ? "52px 主按钮清晰支持恢复。" : "用户需要重新判断如何返回主任务。", recommendation: `把“${action}”设为唯一主按钮，并扩大到至少 48px。`, status: fixed ? "resolved" : "open" },
          { category: "Accessibility", severity: "low", screen: "All", problem: "基础文本与状态可识别。", reason: "操作标签不只依赖颜色。", recommendation: "在真实设备补充读屏测试。", status: "pass" },
          { category: "Task Completion", severity: "low", screen: prototype.ui?.navigation?.[2]?.label || "Progress", problem: "结果与下一步明确。", reason: "用户能判断任务是否完成。", recommendation: "保留当前结果反馈。", status: "pass" },
          { category: "Consistency", severity: "low", screen: "All", problem: "页面行动语言一致。", reason: "三个核心页面沿用相同层级。", recommendation: "保持当前组件规则。", status: "pass" },
        ],
        round,
      };
    }

    reviseArtifact(context, artifact, instruction, artifactKind) {
      if (/^prototype/.test(artifactKind)) {
        const revised = deepClone(artifact);
        revised.version = artifactKind === "prototypeV2" ? "V2" : revised.version;
        revised.settings.touchTarget = artifactKind === "prototypeV2" ? 52 : Math.max(48, revised.settings.touchTarget);
        revised.settings.resumePriority = "primary";
        revised.appliedChanges = [...new Set([...(revised.appliedChanges || []), instruction])].slice(0, 8);
        return revised;
      }
      return this.reviseArtifactLegacy(artifactKind, artifact, instruction);
    }
  }

  class LLMProvider {
    constructor(endpoint = "/api/agent") {
      this.endpoint = endpoint;
    }

    async request(operation, payload, { artifactKind, signal } = {}) {
      let response;
      try {
        response = await fetch(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation, artifactKind, payload }),
          signal,
        });
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        const providerError = new Error("无法连接 AI API proxy。");
        providerError.code = "AI_PROXY_UNREACHABLE";
        providerError.retryable = true;
        throw providerError;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        const providerError = new Error(body?.error?.message || `AI request failed (${response.status}).`);
        providerError.code = body?.error?.code || "AI_REQUEST_FAILED";
        providerError.retryable = Boolean(body?.error?.retryable) || response.status >= 500;
        providerError.details = body?.error?.details || [];
        throw providerError;
      }
      return { data: body.data, meta: body.meta || { provider: "openai" } };
    }

    understandProject(context, options = {}) { return this.request("understandProject", { context }, options); }
    generateInsights(context, options = {}) { return this.request("generateInsights", { context }, options); }
    generatePrinciples(context, options = {}) { return this.request("generatePrinciples", { context }, options); }
    generateUserFlow(context, options = {}) { return this.request("generateUserFlow", { context }, options); }
    generateScreenStructure(context, options = {}) { return this.request("generateScreenStructure", { context }, options); }
    generatePrototype(context, prototypeOptions = {}, options = {}) { return this.request("generatePrototype", { context, prototypeOptions }, options); }
    reviewPrototype(context, prototype, reviewOptions = {}, options = {}) { return this.request("reviewPrototype", { context, prototype, reviewOptions }, options); }
    reviseArtifact(context, artifact, userInstruction, artifactKind, options = {}) { return this.request("reviseArtifact", { context, artifact, userInstruction }, { ...options, artifactKind }); }
  }

  class ProviderGateway {
    constructor(primary, fallback) {
      this.primary = primary;
      this.fallback = fallback;
    }

    async call(method, args, { signal, forceLLM = false, forceLocal = false } = {}) {
      if (forceLocal) return { data: await this.fallback[method](...args), provider: "local-demo", fallback: true, warning: null, meta: {} };
      try {
        const result = await this.primary[method](...args, { signal });
        return { data: result.data, provider: "llm", fallback: false, warning: null, meta: result.meta };
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        if (forceLLM) throw error;
        const data = await this.fallback[method](...args);
        return {
          data,
          provider: "local-demo",
          fallback: true,
          warning: { code: error.code || "AI_REQUEST_FAILED", message: error.message || "真实 AI 请求失败，已使用 Local Demo Provider。", retryable: error.retryable !== false },
          meta: {},
        };
      }
    }
  }

  class AgentRuntime {
    constructor(providerGateway) {
      this.providerGateway = providerGateway;
      this.runToken = 0;
      this.controller = null;
      this.lastPromise = Promise.resolve();
      this.retrySpec = null;
    }

    run(action, operation, execute, commit, { forceLLM = false, forceLocal = false } = {}) {
      if (!state || state.status === "stopped") return Promise.resolve();
      this.cancelPending();
      this.retrySpec = { action, operation, execute, commit };
      const token = ++this.runToken;
      this.controller = new AbortController();
      state.runtime.isRunning = true;
      state.runtime.action = action;
      state.runtime.lastOperation = operation;
      state.runtime.error = null;
      state.runtime.observation = "LLMProvider 正在根据当前 Project Context 与已批准产物生成结构化结果。";
      state.runtime.decision = "等待 Agent 完成当前动作";
      persistActive();
      render();
      this.lastPromise = Promise.resolve()
        .then(() => execute({ signal: this.controller.signal, forceLLM, forceLocal }))
        .then((result) => {
          if (token !== this.runToken || !state || state.status === "stopped") return;
          commit(result.data);
          state.runtime.provider = result.provider;
          state.runtime.providerMeta = result.meta || {};
          state.runtime.providerWarning = result.warning ? { ...result.warning, operation } : null;
          state.runtime.isRunning = false;
          state.runtime.action = "等待用户操作";
          state.updatedAt = new Date().toISOString();
          persistActive();
          render();
          if (result.fallback) showToast("Real AI unavailable — Local Demo fallback used", "error");
        })
        .catch((error) => {
          if (token !== this.runToken || !state || state.status === "stopped" || error?.name === "AbortError") return;
          state.runtime.isRunning = false;
          state.runtime.action = "AI request failed";
          state.runtime.error = { code: error.code || "AI_REQUEST_FAILED", message: error.message || "AI request failed.", retryable: error.retryable !== false, operation };
          state.runtime.observation = "失败响应没有写入 Task State。";
          state.runtime.decision = "Retry AI 或使用 Local Demo Provider 继续";
          persistActive();
          render();
        });
      return this.lastPromise;
    }

    retry({ forceLLM = false, forceLocal = false } = {}) {
      if (!this.retrySpec) return Promise.resolve();
      const { action, operation, execute, commit } = this.retrySpec;
      return this.run(action, operation, execute, commit, { forceLLM, forceLocal });
    }

    cancelPending() {
      this.runToken += 1;
      this.controller?.abort();
      this.controller = null;
    }
  }

  const localDemoProvider = new LocalDemoProvider();
  const llmProvider = new LLMProvider();
  const providerGateway = new ProviderGateway(llmProvider, localDemoProvider);
  const runtime = new AgentRuntime(providerGateway);

  const dom = {
    context: document.querySelector("#context-content"),
    canvas: document.querySelector("#canvas-content"),
    agent: document.querySelector("#agent-content"),
    title: document.querySelector("#canvas-title"),
    eyebrow: document.querySelector("#canvas-eyebrow"),
    meta: document.querySelector("#canvas-meta"),
    projectStatus: document.querySelector("#project-status"),
    footerState: document.querySelector(".agent-state-text"),
    footerNext: document.querySelector("#next-step-copy"),
    footerPrimary: document.querySelector(".footer-primary"),
    stop: document.querySelector(".terminate-task"),
    export: document.querySelector(".export-button"),
    historyDialog: document.querySelector("#history-dialog"),
    historyList: document.querySelector("#history-list"),
    confirmDialog: document.querySelector("#confirm-dialog"),
    toast: document.querySelector(".mvp-toast"),
    providerBadge: document.querySelector(".provider-badge"),
    stages: [...document.querySelectorAll(".steps .step")],
    connectors: [...document.querySelectorAll(".steps em")],
  };

  let toastTimer = 0;
  let state = loadActiveState() || createInitialState();

  function createInitialState() {
    return {
      version: VERSION,
      id: null,
      createdAt: null,
      updatedAt: null,
      status: "creating",
      statusBeforeStop: null,
      selectedPreset: "adhd",
      project: null,
      brief: null,
      context: { answers: [] },
      missingContext: [],
      plan: [],
      currentStep: null,
      outputs: {
        userInsight: null,
        experiencePrinciples: null,
        userFlow: null,
        screenStructure: null,
        prototypes: { v1: null, v2: null },
      },
      reviews: [],
      iterations: [],
      history: [],
      runtime: {
        provider: "llm",
        providerMeta: {},
        providerWarning: null,
        error: null,
        lastOperation: null,
        isRunning: false,
        goal: "创建项目并提供真实需求",
        action: "等待用户输入",
        observation: "尚未创建项目。",
        decision: "填写项目字段并启动 Agent",
        nextStep: "Start with Agent",
      },
      view: null,
      editingKey: null,
      revisionKey: null,
      prototypeScreen: "home",
      selectedVersion: "v1",
    };
  }

  function migrateLoadedState(parsed) {
    if (!parsed || parsed.version !== VERSION) return null;
    parsed.runtime = { provider: "llm", providerMeta: {}, providerWarning: null, error: null, lastOperation: null, ...parsed.runtime, isRunning: false, action: parsed.status === "stopped" ? "任务已停止" : "已从本机恢复" };
    if (parsed.project && parsed.outputs?.prototypes?.v1 && !parsed.outputs.prototypes.v1.ui) {
      const hydratedV1 = localDemoProvider.generatePrototype({ project: parsed.project }, { version: 1 });
      parsed.outputs.prototypes.v1 = { ...hydratedV1, ...parsed.outputs.prototypes.v1, ui: hydratedV1.ui, strategyMap: hydratedV1.strategyMap };
    }
    if (parsed.project && parsed.outputs?.prototypes?.v2 && !parsed.outputs.prototypes.v2.ui) {
      const base = parsed.outputs.prototypes.v1 || localDemoProvider.generatePrototype({ project: parsed.project }, { version: 1 });
      const hydratedV2 = localDemoProvider.generatePrototype({ project: parsed.project }, { version: 2, previous: base });
      parsed.outputs.prototypes.v2 = { ...hydratedV2, ...parsed.outputs.prototypes.v2, ui: hydratedV2.ui, strategyMap: hydratedV2.strategyMap };
    }
    parsed.view = null;
    parsed.editingKey = null;
    parsed.revisionKey = null;
    return parsed;
  }

  function loadActiveState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
      return migrateLoadedState(parsed);
    } catch {
      return null;
    }
  }

  function persistActive() {
    if (!state) return;
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(state));
    } catch {
      showToast("无法写入本机存储，请检查浏览器隐私设置", "error");
    }
  }

  function readHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeHistory(items) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 5)));
    } catch {
      showToast("历史记录保存失败", "error");
    }
  }

  function saveCompletedToHistory() {
    const snapshot = deepClone(state);
    snapshot.runtime.isRunning = false;
    snapshot.view = null;
    snapshot.editingKey = null;
    snapshot.revisionKey = null;
    const items = readHistory().filter((entry) => entry.id !== state.id);
    items.unshift({ id: state.id, name: state.project.projectName, completedAt: state.updatedAt, state: snapshot });
    writeHistory(items);
  }

  function addEvent(type, detail) {
    state.history.unshift({ id: uid(), type, detail, at: new Date().toISOString(), label: nowLabel() });
    state.history = state.history.slice(0, 30);
  }

  function makePlan() {
    return PLAN_BLUEPRINT.map(([id, title, reason]) => ({ id, title, status: "pending", reason, output: null, requiresUserAction: false }));
  }

  function updatePlan(id, status, output = null, requiresUserAction = false) {
    if (!PLAN_STATUS.has(status)) throw new Error(`Unsupported plan status: ${status}`);
    const step = state.plan.find((item) => item.id === id);
    if (!step) return;
    step.status = status;
    step.output = output;
    step.requiresUserAction = requiresUserAction;
    state.currentStep = id;
  }

  function setAgent({ goal, action = "等待用户操作", observation, decision, nextStep }) {
    state.runtime.goal = goal;
    state.runtime.action = action;
    state.runtime.observation = observation;
    state.runtime.decision = decision;
    state.runtime.nextStep = nextStep;
  }

  function showToast(message, tone = "") {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.className = `mvp-toast is-visible${tone ? ` is-${tone}` : ""}`;
    toastTimer = window.setTimeout(() => { dom.toast.className = "mvp-toast"; }, 2400);
  }

  function buildProviderContext() {
    return {
      project: deepClone(state.project),
      brief: state.brief ? deepClone(state.brief) : null,
      addedContext: deepClone(state.context),
      approvedOutputs: {
        userInsight: state.outputs.userInsight ? deepClone(state.outputs.userInsight) : null,
        experiencePrinciples: state.outputs.experiencePrinciples ? deepClone(state.outputs.experiencePrinciples) : null,
        userFlow: state.outputs.userFlow ? deepClone(state.outputs.userFlow) : null,
        screenStructure: state.outputs.screenStructure ? deepClone(state.outputs.screenStructure) : null,
      },
      constraints: state.project?.constraints || "",
      platform: state.project?.platform || "",
    };
  }

  function stampArtifact(value, previous = null) {
    return { ...value, generation: (previous?.generation || 0) + 1, generatedAt: new Date().toISOString() };
  }

  function normalizeReview(value, prototype, round) {
    return {
      ...value,
      round,
      prototypeVersion: prototype.version,
      createdAt: new Date().toISOString(),
      issues: (value.issues || []).map((issue, index) => ({ ...issue, id: issue.id || `${round}-${index}-${uid()}` })),
    };
  }

  function runUnderstanding({ forceLLM = false, forceLocal = false } = {}) {
    updatePlan("brief", "running", "Understanding project", false);
    return runtime.run(
      "理解需求并检测 Missing Context",
      "understandProject",
      ({ signal, forceLLM: retryLLM, forceLocal: retryLocal }) => providerGateway.call("understandProject", [buildProviderContext()], { signal, forceLLM: retryLLM || forceLLM, forceLocal: retryLocal || forceLocal }),
      (result) => {
        state.missingContext = (result.missingContext || []).slice(0, 3).map((question) => ({ ...question, id: question.id || uid() }));
        state.brief = {
          ...result.brief,
          missingContext: state.missingContext.map((question) => question.prompt),
          approved: false,
          revision: (state.brief?.revision || 0) + 1,
        };
        state.status = state.missingContext.length ? "needs-input" : "brief-approval";
        updatePlan("brief", state.missingContext.length ? "needs-input" : "needs-approval", `Project Brief v${state.brief.revision}`, true);
        setAgent(state.missingContext.length ? {
          goal: "补齐影响设计方向的关键上下文",
          observation: result.analysisSummary || `检测到 ${state.missingContext.length} 项关键信息缺失。`,
          decision: "回答问题后才会 Replan 并继续",
          nextStep: "Update Context → Replan",
        } : {
          goal: "确认 Agent 对需求的理解",
          observation: result.analysisSummary || "关键信息完整，Project Brief 已生成。",
          decision: "编辑、要求修改或批准 Brief",
          nextStep: "Approve Brief",
        });
      },
      { forceLLM, forceLocal },
    );
  }

  function createProjectFromForm() {
    const form = document.querySelector("#project-form");
    if (!form || state.runtime.isRunning) return;
    const data = new FormData(form);
    const project = {
      projectName: String(data.get("projectName") || "").trim() || "Untitled Project",
      productDescription: String(data.get("productDescription") || "").trim(),
      targetUsers: String(data.get("targetUsers") || "").trim(),
      platform: String(data.get("platform") || "").trim(),
      goal: String(data.get("goal") || "").trim(),
      constraints: String(data.get("constraints") || "").trim(),
      additionalContext: String(data.get("additionalContext") || "").trim(),
    };
    state = createInitialState();
    state.id = uid();
    state.createdAt = new Date().toISOString();
    state.updatedAt = state.createdAt;
    state.selectedPreset = String(data.get("preset") || "adhd");
    state.project = project;
    state.plan = makePlan();
    addEvent("project-created", `创建项目「${project.projectName}」`);
    setAgent({
      goal: "理解真实产品需求",
      observation: "正在根据当前 Project Context 生成结构化 Brief 并判断是否需要追问。",
      decision: "等待 Requirement Understanding 完成",
      nextStep: "Project Brief / Missing Context",
    });
    persistActive();
    render();
    return runUnderstanding();
  }

  function updateContextFromForm() {
    const form = document.querySelector("#context-form");
    if (!form || state.runtime.isRunning) return;
    const data = new FormData(form);
    const answered = [];
    for (const question of state.missingContext) {
      const answer = String(data.get(question.field) || "").trim();
      if (!answer) {
        showToast("请回答所有关键问题后再继续", "error");
        form.querySelector(`[name="${question.field}"]`)?.focus();
        return;
      }
      state.project[question.field] = answer;
      answered.push({ question: question.prompt, answer });
    }
    state.context.answers.push(...answered);
    addEvent("context-updated", `补充 ${answered.length} 项上下文并重新规划`);
    state.missingContext = [];
    persistActive();
    render();
    showToast("Context 已更新，Agent 正在 Replan", "success");
    return runUnderstanding();
  }

  function syncBriefForm(showMessage = true) {
    const form = document.querySelector("#brief-form");
    if (!form || !state.brief) return true;
    const data = new FormData(form);
    ["goal", "targetUser", "productType", "platform", "mainProblem", "constraints"].forEach((field) => {
      state.brief[field] = String(data.get(field) || "").trim();
    });
    state.brief.revision = (state.brief.revision || 1) + 1;
    state.project.goal = state.brief.goal;
    state.project.targetUsers = state.brief.targetUser;
    state.project.platform = state.brief.platform;
    state.project.constraints = state.brief.constraints;
    addEvent("brief-edited", `保存 Project Brief v${state.brief.revision}`);
    persistActive();
    render();
    if (showMessage) showToast("Brief edits 已保存", "success");
    return true;
  }

  function approveBrief() {
    if (state.status !== "brief-approval" || state.runtime.isRunning) return;
    syncBriefForm(false);
    state.brief.approved = true;
    updatePlan("brief", "completed", `Approved Brief v${state.brief.revision}`, false);
    updatePlan("userInsight", "running");
    addEvent("approved", "批准 Project Brief");
    return runtime.run(
      "生成 User Insight",
      "generateInsights",
      ({ signal, forceLLM, forceLocal }) => providerGateway.call("generateInsights", [buildProviderContext()], { signal, forceLLM, forceLocal }),
      (value) => {
        state.outputs.userInsight = stampArtifact(value, state.outputs.userInsight);
        state.status = "user-insight";
        state.view = null;
        updatePlan("userInsight", "needs-approval", "User Insight v1", true);
        setAgent({
          goal: "把需求转化为可执行的用户洞察",
          observation: "已生成 Goals、Behaviors、Pain Points、Cognitive Needs 与 Design Implications。",
          decision: "编辑、重新生成、要求修改或批准 User Insight",
          nextStep: "Approve User Insight",
        });
      },
    );
  }

  const artifactFlow = {
    userInsight: {
      status: "user-insight",
      plan: "userInsight",
      nextPlan: "experiencePrinciples",
      nextStatus: "experience-principles",
      nextKey: "experiencePrinciples",
      action: "生成 Experience Principles",
      providerMethod: "generatePrinciples",
      goal: "定义项目对应的体验原则",
      observation: "用户洞察已转化为可用于评估方案的体验原则。",
    },
    experiencePrinciples: {
      status: "experience-principles",
      plan: "experiencePrinciples",
      nextPlan: "userFlow",
      nextStatus: "user-flow",
      nextKey: "userFlow",
      action: "生成 User Flow",
      providerMethod: "generateUserFlow",
      goal: "定义完整任务流与恢复路径",
      observation: "已根据当前项目生成主任务路径、决策点与恢复规则。",
    },
    userFlow: {
      status: "user-flow",
      plan: "userFlow",
      nextPlan: "screenStructure",
      nextStatus: "screen-structure",
      nextKey: "screenStructure",
      action: "生成 Screen Structure",
      providerMethod: "generateScreenStructure",
      goal: "把任务流映射为核心页面",
      observation: "已根据批准的 Flow 定义核心页面、主要行动与共享规则。",
    },
    screenStructure: {
      status: "screen-structure",
      plan: "screenStructure",
      nextPlan: "prototype",
      nextStatus: "prototype-v1",
      nextKey: "prototypeV1",
      action: "生成 Mock Prototype V1",
      providerMethod: "generatePrototype",
      goal: "验证页面结构和设计策略",
      observation: "Prototype V1 已生成，三个页面可以实际切换。",
    },
  };

  function approveArtifact(key) {
    const flow = artifactFlow[key];
    if (!flow || state.status !== flow.status || state.runtime.isRunning) return;
    updatePlan(flow.plan, "completed", `${ARTIFACT_LABELS[key]} approved`, false);
    updatePlan(flow.nextPlan, "running");
    addEvent("approved", `批准 ${ARTIFACT_LABELS[key]}`);
    const providerArgs = flow.nextKey === "prototypeV1" ? [buildProviderContext(), { version: 1, previous: null }] : [buildProviderContext()];
    return runtime.run(
      flow.action,
      flow.providerMethod,
      ({ signal, forceLLM, forceLocal }) => providerGateway.call(flow.providerMethod, providerArgs, { signal, forceLLM, forceLocal }),
      (value) => {
        const stamped = stampArtifact(value, flow.nextKey === "prototypeV1" ? state.outputs.prototypes.v1 : state.outputs[flow.nextKey]);
        if (flow.nextKey === "prototypeV1") {
          state.outputs.prototypes.v1 = stamped;
          state.selectedVersion = "v1";
        } else {
          state.outputs[flow.nextKey] = stamped;
        }
        state.status = flow.nextStatus;
        state.view = null;
        updatePlan(flow.nextPlan, "needs-approval", `${ARTIFACT_LABELS[flow.nextKey]} v1`, true);
        setAgent({
          goal: flow.goal,
          observation: flow.observation,
          decision: `检查 ${ARTIFACT_LABELS[flow.nextKey]}，可编辑、重新生成、要求修改或批准`,
          nextStep: flow.nextKey === "prototypeV1" ? "Approve Prototype V1 → AI Review" : `Approve ${ARTIFACT_LABELS[flow.nextKey]}`,
        });
      },
    );
  }

  function approvePrototypeV1() {
    if (state.status !== "prototype-v1" || state.runtime.isRunning) return;
    updatePlan("prototype", "completed", "Prototype V1 approved", false);
    updatePlan("review", "running");
    addEvent("approved", "批准 Prototype V1");
    const prototype = state.outputs.prototypes.v1;
    return runtime.run(
      "运行 AI Review · Round 1",
      "reviewPrototype",
      ({ signal, forceLLM, forceLocal }) => providerGateway.call("reviewPrototype", [buildProviderContext(), prototype, { round: 1 }], { signal, forceLLM, forceLocal }),
      (value) => {
        const review = normalizeReview(value, prototype, 1);
        state.reviews = [review];
        state.status = "review-v1";
        state.view = null;
        const openCount = review.issues.filter((item) => item.status === "open").length;
        updatePlan("review", "needs-approval", `${openCount} open issue${openCount === 1 ? "" : "s"}`, true);
        setAgent({
          goal: "识别会阻碍当前产品任务完成的问题",
          observation: `六类检查已完成，检测到 ${openCount} 个需要 Human Decision 的问题。`,
          decision: "Apply Fix 或 Ignore",
          nextStep: openCount ? "Apply Fix → Prototype V2" : "Complete Task",
        });
      },
    );
  }

  function applyFix(issueId) {
    if (state.status !== "review-v1" || state.runtime.isRunning) return;
    const review = state.reviews[0];
    const issue = review?.issues.find((item) => item.id === issueId);
    if (!issue || issue.status !== "open") return;
    issue.status = "fixing";
    updatePlan("review", "running", "Applying review fix", false);
    addEvent("fix-requested", `应用修复：${issue.recommendation}`);
    const instruction = `Fix this validated review issue in the prototype data. Screen: ${issue.screen}. Problem: ${issue.problem}. Reason: ${issue.reason}. Recommendation: ${issue.recommendation}. Return a complete Prototype V2 that preserves unrelated valid content.`;
    return runtime.run(
      "应用评审建议并更新 Prototype 数据",
      "reviseArtifact",
      ({ signal, forceLLM, forceLocal }) => providerGateway.call("reviseArtifact", [buildProviderContext(), state.outputs.prototypes.v1, instruction, "prototypeV2"], { signal, forceLLM, forceLocal }),
      (value) => {
        const revised = stampArtifact({ ...value, version: "V2" }, state.outputs.prototypes.v1);
        if (!Array.isArray(revised.appliedChanges) || !revised.appliedChanges.length) revised.appliedChanges = [issue.recommendation];
        state.outputs.prototypes.v2 = revised;
        issue.status = "fixed-in-v2";
        const iteration = {
          id: uid(),
          from: "V1",
          to: "V2",
          issueId,
          problem: issue.problem,
          changes: deepClone(revised.appliedChanges),
          at: new Date().toISOString(),
        };
        const existingIteration = state.iterations.findIndex((item) => item.issueId === issueId);
        if (existingIteration >= 0) state.iterations[existingIteration] = iteration;
        else state.iterations.push(iteration);
        state.status = "prototype-v2";
        state.selectedVersion = "v2";
        state.prototypeScreen = "reading";
        state.view = null;
        updatePlan("review", "running", "Prototype V2 ready for re-review", true);
        setAgent({
          goal: "验证修复是否真正解决评审问题",
          observation: "LLMProvider 已根据 Review Issue 返回完整 Prototype V2；V1 保持可回看。",
          decision: "对比 V1 / V2，然后重新运行评审",
          nextStep: "Re-review Prototype V2",
        });
      },
    );
  }

  function ignoreIssue(issueId) {
    if (state.status !== "review-v1") return;
    const issue = state.reviews[0]?.issues.find((item) => item.id === issueId);
    if (!issue || issue.status !== "open") return;
    issue.status = "ignored";
    issue.ignoredAt = new Date().toISOString();
    addEvent("issue-ignored", `忽略问题：${issue.problem}`);
    updatePlan("review", "needs-approval", "Issue ignored by user", true);
    setAgent({
      goal: "记录 Human Decision",
      observation: "问题已标记为 Ignore，原型数据没有变化。",
      decision: "可完成 V1，或仍然应用修复生成 V2",
      nextStep: "Complete without fix / Re-open issue",
    });
    persistActive();
    render();
  }

  function reopenIssue(issueId) {
    const issue = state.reviews[0]?.issues.find((item) => item.id === issueId);
    if (!issue || issue.status !== "ignored") return;
    issue.status = "open";
    delete issue.ignoredAt;
    addEvent("issue-reopened", `重新打开问题：${issue.problem}`);
    persistActive();
    render();
  }

  function reReviewV2() {
    if (state.status !== "prototype-v2" || state.runtime.isRunning) return;
    updatePlan("review", "running", "Re-reviewing Prototype V2", false);
    const prototype = state.outputs.prototypes.v2;
    return runtime.run(
      "重新运行 AI Review · Round 2",
      "reviewPrototype",
      ({ signal, forceLLM, forceLocal }) => providerGateway.call("reviewPrototype", [buildProviderContext(), prototype, { round: 2, previousReview: state.reviews[0] }], { signal, forceLLM, forceLocal }),
      (value) => {
        const review = normalizeReview(value, prototype, 2);
        state.reviews = [...state.reviews.filter((item) => item.round !== 2), review];
        state.status = "review-v2";
        state.view = null;
        const openCount = review.issues.filter((item) => item.status === "open").length;
        updatePlan("review", "needs-approval", openCount ? `${openCount} issue still open` : "All 6 checks passed", true);
        addEvent("review-completed", `Prototype V2 重新评审完成；${openCount} 个问题仍为 open`);
        setAgent({
          goal: "确认迭代是否达到本轮完成标准",
          observation: openCount ? `Round 2 仍有 ${openCount} 个 open issue，需要 Human Decision。` : "Round 2 已完成；关键问题为 Resolved，六类检查通过。",
          decision: openCount ? "检查并决定是否继续修复" : "完成任务并保存到 History",
          nextStep: openCount ? "Review issues" : "Complete Task",
        });
      },
    );
  }

  function completeTask(withoutFix = false) {
    if (!["review-v2", "review-v1"].includes(state.status) || state.runtime.isRunning) return;
    if (state.status === "review-v1" && !withoutFix) return;
    state.status = "complete";
    state.view = null;
    updatePlan("review", "completed", withoutFix ? "Completed with ignored issue" : "Round 2 passed", false);
    addEvent("completed", withoutFix ? "任务完成（1 个问题被用户忽略）" : "任务完成，Prototype V2 通过复评");
    setAgent({
      goal: "交付完整设计任务记录",
      observation: withoutFix ? "任务按 Human Decision 完成，保留一个 ignored issue。" : "Brief、洞察、原则、流程、页面结构、V1/V2 与两轮 Review 均已保存。",
      decision: "导出 JSON、查看 History 或创建新项目",
      nextStep: "Export / History",
    });
    state.updatedAt = new Date().toISOString();
    persistActive();
    saveCompletedToHistory();
    render();
    showToast("Task completed and saved to History", "success");
  }

  function stopTask() {
    if (!state.id || ["complete", "stopped"].includes(state.status) || (state.status === "creating" && !state.runtime.isRunning)) return;
    runtime.cancelPending();
    state.statusBeforeStop = state.status;
    state.status = "stopped";
    const step = state.plan.find((item) => item.id === state.currentStep);
    if (step) {
      state.stoppedPlanState = { id: step.id, status: step.status, output: step.output, requiresUserAction: step.requiresUserAction };
      updatePlan(step.id, "blocked", "Stopped by user", true);
    }
    state.runtime.isRunning = false;
    addEvent("stopped", "用户停止任务；当前 API 请求已中止，Runtime token 已失效");
    setAgent({
      goal: "保持任务状态不再变化",
      action: "任务已停止",
      observation: "AbortController 已中止当前请求，Runtime token 已失效，迟到响应无法写入。",
      decision: "Resume 或保留当前状态",
      nextStep: "Resume Task",
    });
    persistActive();
    render();
    showToast("Task stopped. No delayed updates will run.");
  }

  function resumeTask() {
    if (state.status !== "stopped") return;
    state.status = state.statusBeforeStop || "brief-approval";
    if (state.stoppedPlanState) {
      updatePlan(state.stoppedPlanState.id, state.stoppedPlanState.status, state.stoppedPlanState.output, state.stoppedPlanState.requiresUserAction);
      delete state.stoppedPlanState;
    }
    state.statusBeforeStop = null;
    addEvent("resumed", "从停止状态恢复任务");
    setAgent({
      goal: "从已保存状态继续设计任务",
      observation: `已恢复到 ${state.status}，此前产物与决策保持不变。`,
      decision: "继续当前阶段",
      nextStep: footerConfig().label,
    });
    persistActive();
    render();
    showToast("Task resumed", "success");
  }

  function regenerateArtifact(key, { forceLLM = false, forceLocal = false } = {}) {
    if (state.runtime.isRunning) return;
    const outputKey = key === "prototypeV1" || key === "prototypeV2" ? null : key;
    const current = key === "prototypeV1" ? state.outputs.prototypes.v1 : key === "prototypeV2" ? state.outputs.prototypes.v2 : state.outputs[outputKey];
    if (!current) return;
    const methodByKey = {
      userInsight: "generateInsights",
      experiencePrinciples: "generatePrinciples",
      userFlow: "generateUserFlow",
      screenStructure: "generateScreenStructure",
      prototypeV1: "generatePrototype",
      prototypeV2: "generatePrototype",
    };
    const method = methodByKey[key];
    const args = key === "prototypeV1" ? [buildProviderContext(), { version: 1, previous: null, regenerate: true }] : key === "prototypeV2" ? [buildProviderContext(), { version: 2, previous: state.outputs.prototypes.v1, regenerate: true }] : [buildProviderContext()];
    return runtime.run(
      `重新生成 ${ARTIFACT_LABELS[key]}`,
      method,
      ({ signal, forceLLM: retryLLM, forceLocal: retryLocal }) => providerGateway.call(method, args, { signal, forceLLM: retryLLM || forceLLM, forceLocal: retryLocal || forceLocal }),
      (value) => {
        const next = stampArtifact(value, current);
        if (key === "prototypeV1") state.outputs.prototypes.v1 = next;
        else if (key === "prototypeV2") state.outputs.prototypes.v2 = { ...next, version: "V2" };
        else state.outputs[key] = next;
        addEvent("regenerated", `重新生成 ${ARTIFACT_LABELS[key]} · v${next.generation}`);
        showToast(`${ARTIFACT_LABELS[key]} regenerated`, "success");
      },
      { forceLLM, forceLocal },
    );
  }

  function saveArtifactEdit(key) {
    const textarea = document.querySelector("#artifact-json-editor");
    if (!textarea) return;
    try {
      const parsed = JSON.parse(textarea.value);
      if (key === "prototypeV1") state.outputs.prototypes.v1 = parsed;
      else if (key === "prototypeV2") state.outputs.prototypes.v2 = parsed;
      else state.outputs[key] = parsed;
      state.editingKey = null;
      addEvent("artifact-edited", `编辑 ${ARTIFACT_LABELS[key]}`);
      persistActive();
      render();
      showToast("Artifact edits saved", "success");
    } catch {
      showToast("JSON 格式无效，请修正后保存", "error");
      textarea.focus();
    }
  }

  function submitRevision(key, { forceLLM = false, forceLocal = false } = {}) {
    const input = document.querySelector("#revision-instruction");
    const instruction = String(input?.value || "").trim();
    if (!instruction) {
      showToast("请输入希望 Agent 修改的内容", "error");
      input?.focus();
      return;
    }
    const current = key === "brief" ? state.brief : key === "prototypeV1" ? state.outputs.prototypes.v1 : key === "prototypeV2" ? state.outputs.prototypes.v2 : state.outputs[key];
    return runtime.run(
      `根据反馈修改 ${ARTIFACT_LABELS[key]}`,
      "reviseArtifact",
      ({ signal, forceLLM: retryLLM, forceLocal: retryLocal }) => providerGateway.call("reviseArtifact", [buildProviderContext(), current, instruction, key], { signal, forceLLM: retryLLM || forceLLM, forceLocal: retryLocal || forceLocal }),
      (value) => {
        const revised = stampArtifact(value, current);
        if (key === "brief") {
          revised.approved = false;
          revised.revision = (state.brief.revision || 1) + 1;
          revised.missingContext = state.brief.missingContext || [];
          state.brief = revised;
        } else if (key === "prototypeV1") state.outputs.prototypes.v1 = { ...revised, version: "V1" };
        else if (key === "prototypeV2") state.outputs.prototypes.v2 = { ...revised, version: "V2" };
        else state.outputs[key] = revised;
        state.revisionKey = null;
        addEvent("agent-revision", `${ARTIFACT_LABELS[key]}：${instruction}`);
        showToast("Agent revision replaced the artifact", "success");
      },
      { forceLLM, forceLocal },
    );
  }

  function footerConfig() {
    if (state.runtime.isRunning) return { label: "Agent working…", next: state.runtime.action, disabled: true };
    if (state.runtime.error) return { label: "Retry AI", next: `${state.runtime.error.code}: ${state.runtime.error.message}` };
    const configs = {
      creating: { label: "Start with Agent", next: "输入可以不完整，Agent 会先生成 Brief 并检测缺失信息" },
      "needs-input": { label: "Update Context", next: "Missing Context 正在阻塞后续生成" },
      "brief-approval": { label: "Approve Brief", next: "未经批准不会生成 User Insight" },
      "user-insight": { label: "Approve & Continue", next: "批准后生成 Experience Principles" },
      "experience-principles": { label: "Approve & Continue", next: "批准后生成 User Flow" },
      "user-flow": { label: "Approve & Continue", next: "批准后生成 Screen Structure" },
      "screen-structure": { label: "Approve & Generate", next: "批准后生成 Prototype V1" },
      "prototype-v1": { label: "Approve & Review", next: "批准后运行第一轮 AI Review" },
      "review-v1": { label: "Apply Fix", next: "修复会真实修改 Prototype 数据并生成 V2" },
      "prototype-v2": { label: "Re-review V2", next: "重新检查修复结果" },
      "review-v2": { label: "Complete Task", next: "完成后写入 History 并开放 JSON Export" },
      complete: { label: "New Project", next: "本次任务已保存，可以导出或创建新项目" },
      stopped: { label: "Resume Task", next: "从停止前状态继续，不丢失任何产物" },
    };
    return configs[state.status] || configs.creating;
  }

  function handleFooterPrimary() {
    if (state.runtime.isRunning) return;
    if (state.runtime.error) return runtime.retry({ forceLLM: true });
    const current = CURRENT_ARTIFACT[state.status];
    if (state.view && state.view !== current) {
      state.view = null;
      render();
      return;
    }
    if (state.status === "creating") return createProjectFromForm();
    if (state.status === "needs-input") return updateContextFromForm();
    if (state.status === "brief-approval") return approveBrief();
    if (state.status === "user-insight") return approveArtifact("userInsight");
    if (state.status === "experience-principles") return approveArtifact("experiencePrinciples");
    if (state.status === "user-flow") return approveArtifact("userFlow");
    if (state.status === "screen-structure") return approveArtifact("screenStructure");
    if (state.status === "prototype-v1") return approvePrototypeV1();
    if (state.status === "review-v1") {
      const open = state.reviews[0]?.issues.find((item) => item.status === "open");
      if (open) return applyFix(open.id);
      return completeTask(true);
    }
    if (state.status === "prototype-v2") return reReviewV2();
    if (state.status === "review-v2") return completeTask(false);
    if (state.status === "complete") return openNewProject();
    if (state.status === "stopped") return resumeTask();
  }

  function artifactValue(key) {
    if (key === "brief") return state.brief;
    if (key === "prototypeV1") return state.outputs.prototypes.v1;
    if (key === "prototypeV2") return state.outputs.prototypes.v2;
    if (key === "reviewV1") return state.reviews[0];
    if (key === "reviewV2") return state.reviews[1];
    return state.outputs[key];
  }

  function render() {
    renderStages();
    renderContext();
    renderAgent();
    renderCanvas();
    renderRuntimeState();
    renderFooter();
  }

  function renderStages() {
    const active = STAGE_BY_STATUS[state.status] ?? 0;
    dom.stages.forEach((stage, index) => {
      stage.classList.toggle("active", index === active);
      stage.classList.toggle("completed", index < active || state.status === "complete");
    });
    dom.connectors.forEach((connector, index) => connector.classList.toggle("completed", index < active || state.status === "complete"));
  }

  function renderContext() {
    if (!state.project) {
      dom.projectStatus.textContent = "未开始";
      dom.context.innerHTML = `
        <div class="empty-panel"><span class="empty-index">01</span><h3>Project context</h3><p>项目创建后，这里会持续保存 Brief、Requirements、Users、Constraints 与 History。</p></div>
        <div class="context-principle"><b>Functional MVP</b><p>完整流程优先。所有 Approval、Fix 和 Review 都会写入真实 Task State。</p></div>`;
      return;
    }
    dom.projectStatus.textContent = statusLabel(state.status);
    const navItems = [
      ["brief", "Brief", Boolean(state.brief)],
      ["userInsight", "User Insight", Boolean(state.outputs.userInsight)],
      ["experiencePrinciples", "Principles", Boolean(state.outputs.experiencePrinciples)],
      ["userFlow", "User Flow", Boolean(state.outputs.userFlow)],
      ["screenStructure", "Screens", Boolean(state.outputs.screenStructure)],
      ["prototypeV1", "Prototype V1", Boolean(state.outputs.prototypes.v1)],
      ["reviewV1", "Review V1", Boolean(state.reviews[0])],
      ["prototypeV2", "Prototype V2", Boolean(state.outputs.prototypes.v2)],
      ["reviewV2", "Review V2", Boolean(state.reviews[1])],
    ];
    dom.context.innerHTML = `
      <section class="context-project">
        <p class="eyebrow">ACTIVE PROJECT</p>
        <h3>${esc(state.project.projectName)}</h3>
        <p>${esc(state.project.productDescription || "产品描述待补充")}</p>
      </section>
      <section class="context-facts">
        <dl>
          <div><dt>Users</dt><dd>${esc(state.project.targetUsers || "待补充")}</dd></div>
          <div><dt>Platform</dt><dd>${esc(state.project.platform || "待补充")}</dd></div>
          <div><dt>Goal</dt><dd>${esc(state.project.goal || "待补充")}</dd></div>
          <div><dt>Constraints</dt><dd>${esc(state.project.constraints || "待补充")}</dd></div>
        </dl>
      </section>
      <section class="artifact-nav" aria-label="项目产物">
        <p class="eyebrow">OUTPUTS</p>
        ${navItems.map(([key, label, ready]) => `<button type="button" data-action="view-artifact" data-key="${key}" ${ready ? "" : "disabled"}><span>${esc(label)}</span><b>${ready ? "Open" : "Pending"}</b></button>`).join("")}
      </section>
      <section class="event-history">
        <p class="eyebrow">HISTORY</p>
        ${state.history.slice(0, 6).map((event) => `<article><i></i><div><b>${esc(event.detail)}</b><time>${esc(event.label)}</time></div></article>`).join("") || "<p>尚无操作记录</p>"}
      </section>`;
  }

  function renderAgent() {
    dom.providerBadge.textContent = state.runtime?.provider === "local-demo" ? "Local Demo Fallback" : `LLM Provider${state.runtime?.providerMeta?.model ? ` · ${state.runtime.providerMeta.model}` : ""}`;
    if (!state.project) {
      dom.agent.innerHTML = `
        ${agentBlock("Current Goal", "理解真实设计需求")}
        ${agentBlock("Current Action", "等待项目输入", "muted")}
        <section class="agent-plan"><p class="agent-label">PLAN</p>${PLAN_BLUEPRINT.map(([, title], index) => `<div class="agent-step pending"><i>${index + 1}</i><span>${esc(title)}</span><b>pending</b></div>`).join("")}</section>
        ${agentBlock("Observation", "Agent 不会直接生成原型；先形成可编辑 Brief。")}
        ${agentBlock("Needs Your Decision", "填写项目信息并启动 Agent", "decision")}
        ${agentBlock("Next Step", "Start with Agent", "next")}`;
      return;
    }
    dom.agent.innerHTML = `
      ${agentBlock("Current Goal", state.runtime.goal)}
      ${agentBlock("Current Action", state.runtime.action, state.runtime.isRunning ? "running" : "muted")}
      ${state.runtime.providerWarning ? `<section class="provider-alert"><p class="agent-label">PROVIDER FALLBACK</p><b>${esc(state.runtime.providerWarning.code)}</b><p>${esc(state.runtime.providerWarning.message)}</p><div><button type="button" data-action="retry-ai">Retry real AI</button><button type="button" data-action="dismiss-provider-warning">Keep fallback result</button></div></section>` : ""}
      <section class="agent-plan"><p class="agent-label">PLAN</p>${state.plan.map((step, index) => `<div class="agent-step ${esc(step.status)}"><i>${step.status === "completed" ? "✓" : index + 1}</i><span><b>${esc(step.title)}</b><small>${esc(step.reason)}</small></span><em>${esc(step.status)}</em></div>`).join("")}</section>
      ${agentBlock("Observation", state.runtime.observation)}
      ${agentBlock("Needs Your Decision", state.runtime.decision, "decision")}
      ${agentBlock("Next Step", state.runtime.nextStep, "next")}`;
  }

  function agentBlock(label, copy, tone = "") {
    return `<section class="agent-block ${tone}"><p class="agent-label">${esc(label)}</p><div>${esc(copy || "—")}</div></section>`;
  }

  function renderCanvas() {
    if (state.status === "creating") return renderCreateProject();
    if (state.status === "stopped") return renderStopped();
    const key = state.view || CURRENT_ARTIFACT[state.status];
    if (state.view && artifactValue(state.view)) return renderArtifactByKey(state.view, true);
    if (state.status === "needs-input") return renderNeedsInput();
    if (key) return renderArtifactByKey(key, false);
    if (state.status === "complete") return renderComplete();
  }

  function renderRuntimeState() {
    if (state.runtime.isRunning) {
      dom.canvas.insertAdjacentHTML("beforeend", `<section class="runtime-state is-loading" role="status"><i></i><div><b>${esc(state.runtime.action)}</b><p>Calling LLMProvider · structured JSON only</p></div></section>`);
    } else if (state.runtime.error) {
      dom.canvas.insertAdjacentHTML("beforeend", `<section class="runtime-state is-error" role="alert"><div><b>AI request failed · ${esc(state.runtime.error.code)}</b><p>${esc(state.runtime.error.message)} Task State 未被失败结果修改。</p></div><div><button class="outline" type="button" data-action="use-demo">Use Local Demo</button><button class="primary" type="button" data-action="retry-ai">Retry AI</button></div></section>`);
    }
  }

  function setCanvasHeading(eyebrow, title, meta = "") {
    dom.eyebrow.textContent = eyebrow;
    dom.title.textContent = title;
    dom.meta.innerHTML = meta;
  }

  function renderCreateProject() {
    const preset = PRESETS[state.selectedPreset] || PRESETS.adhd;
    const values = state.project || preset;
    setCanvasHeading("CREATE PROJECT", "从真实需求开始", '<span class="meta-chip">Inputs may be incomplete</span>');
    dom.canvas.innerHTML = `
      <form id="project-form" class="project-form">
        <label class="field field-wide"><span>Preset <small>仅保留 V1 已有案例</small></span><select name="preset" id="preset-select">${Object.entries(PRESETS).map(([key, item]) => `<option value="${key}" ${key === state.selectedPreset ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select></label>
        <label class="field"><span>Project Name</span><input name="projectName" value="${esc(values.projectName)}" maxlength="80" /></label>
        <label class="field"><span>Platform</span><input name="platform" value="${esc(values.platform)}" maxlength="80" /></label>
        <label class="field field-wide"><span>Product Description</span><textarea name="productDescription" rows="3" maxlength="500">${esc(values.productDescription)}</textarea></label>
        <label class="field field-wide"><span>Target Users</span><textarea name="targetUsers" rows="2" maxlength="300">${esc(values.targetUsers)}</textarea></label>
        <label class="field field-wide"><span>Goal</span><textarea name="goal" rows="2" maxlength="300">${esc(values.goal)}</textarea></label>
        <label class="field"><span>Constraints <small>可留空，由 Agent 追问</small></span><textarea name="constraints" rows="4" maxlength="500">${esc(values.constraints)}</textarea></label>
        <label class="field"><span>Additional Context <small>可留空</small></span><textarea name="additionalContext" rows="4" maxlength="500">${esc(values.additionalContext)}</textarea></label>
        <div class="form-note field-wide"><i>Agent first understands</i><p>提交后先生成可编辑 Project Brief。重要信息缺失时，任务会进入 needs-input 并真实阻塞后续生成。</p></div>
        <button class="primary form-submit field-wide" type="submit">Start with Agent <span>→</span></button>
      </form>`;
  }

  function renderNeedsInput() {
    setCanvasHeading("NEEDS INPUT", "补齐会改变设计方向的信息", `<span class="meta-chip warning">${state.missingContext.length} questions · blocked</span>`);
    dom.canvas.innerHTML = `
      <div class="blocking-banner"><div><b>后续生成已暂停</b><p>Agent 最多只问 1–3 个关键问题。回答会写入 Project Context，并触发 Replan。</p></div><span>needs-input</span></div>
      ${renderBriefSummary()}
      <form id="context-form" class="context-form">
        <div class="artifact-section-head"><div><p class="eyebrow">MISSING CONTEXT</p><h2>Agent 需要你的判断</h2></div></div>
        ${state.missingContext.map((question, index) => `<label class="question-field"><b><i>${index + 1}</i>${esc(question.prompt)}</b><textarea name="${esc(question.field)}" rows="3" placeholder="${esc(question.placeholder)}"></textarea></label>`).join("")}
        <button class="primary form-submit" type="submit">Update Context → Replan</button>
      </form>`;
  }

  function renderBriefSummary() {
    return `<article class="brief-summary artifact-card"><p class="eyebrow">PROJECT BRIEF · DRAFT</p><dl>${[
      ["Goal", state.brief.goal], ["Target User", state.brief.targetUser], ["Product Type", state.brief.productType], ["Platform", state.brief.platform], ["Main Problem", state.brief.mainProblem], ["Constraints", state.brief.constraints],
    ].map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></article>`;
  }

  function renderArtifactByKey(key, browsing) {
    const value = artifactValue(key);
    if (!value) return;
    if (key === "brief") return renderBrief(browsing);
    if (key === "prototypeV1" || key === "prototypeV2") return renderPrototype(key, browsing);
    if (key === "reviewV1" || key === "reviewV2") return renderReview(key, browsing);
    setCanvasHeading(browsing ? "OUTPUT ARCHIVE" : "WORK CANVAS", ARTIFACT_LABELS[key], `<span class="meta-chip">Generation ${value.generation || 1}</span>`);
    let body = "";
    if (key === "userInsight") body = renderUserInsight(value);
    if (key === "experiencePrinciples") body = renderPrinciples(value);
    if (key === "userFlow") body = renderUserFlow(value);
    if (key === "screenStructure") body = renderScreenStructure(value);
    dom.canvas.innerHTML = `${browsing ? archiveNotice() : ""}${body}${renderArtifactActions(key, browsing)}`;
  }

  function archiveNotice() {
    return `<div class="archive-notice"><span>Viewing saved output</span><button type="button" data-action="return-current">返回当前步骤</button></div>`;
  }

  function renderBrief(browsing) {
    setCanvasHeading(browsing ? "OUTPUT ARCHIVE" : "AGENT UNDERSTANDING", "Project Brief", `<span class="meta-chip">Revision ${state.brief.revision}</span>`);
    if (browsing) {
      dom.canvas.innerHTML = `${archiveNotice()}${renderBriefSummary()}`;
      return;
    }
    dom.canvas.innerHTML = `
      <div class="approval-banner"><div><b>Agent 已理解需求</b><p>这份 Brief 是后续所有生成的单一事实来源。修改会同步回 Project Context。</p></div><span>needs-approval</span></div>
      <form id="brief-form" class="brief-form artifact-card">
        ${[
          ["goal", "Goal", 2], ["targetUser", "Target User", 2], ["productType", "Product Type", 1], ["platform", "Platform", 1], ["mainProblem", "Main Problem", 4], ["constraints", "Constraints", 3],
        ].map(([field, label, rows]) => `<label class="field ${rows > 2 ? "field-wide" : ""}"><span>${label}</span><textarea name="${field}" rows="${rows}">${esc(state.brief[field])}</textarea></label>`).join("")}
      </form>
      <div class="artifact-actions"><button class="outline" type="button" data-action="save-brief">Save edits</button><button class="outline" type="button" data-action="toggle-revision" data-key="brief">Ask Agent to revise</button><button class="primary" type="button" data-action="approve-brief">Approve Brief</button></div>
      ${state.revisionKey === "brief" ? renderRevisionBox("brief") : ""}`;
  }

  function renderUserInsight(value) {
    return `<div class="insight-grid">
      ${insightGroup("Goals", value.goals, "01")}${insightGroup("Behaviors", value.behaviors, "02")}${insightGroup("Pain Points", value.painPoints, "03", "critical")}${insightGroup("Cognitive Needs", value.cognitiveNeeds, "04")}
      <section class="artifact-card implication-card"><p class="eyebrow">DESIGN IMPLICATIONS</p><ol>${value.implications.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>${revisionNote(value)}</section>
    </div>`;
  }

  function insightGroup(title, items, index, tone = "") {
    return `<section class="artifact-card insight-group ${tone}"><span class="large-index">${index}</span><h2>${esc(title)}</h2><ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>`;
  }

  function renderPrinciples(value) {
    return `<div class="principles-list">${value.principles.map((item, index) => `<article class="principle-row"><span>0${index + 1}</span><div><h2>${esc(item.title)}</h2><p>${esc(item.detail)}</p></div></article>`).join("")}</div>${revisionNote(value)}`;
  }

  function renderUserFlow(value) {
    return `<section class="flow-board artifact-card"><p class="eyebrow">GOLDEN PATH</p><div class="flow-path">${value.happyPath.map((step, index) => `<div class="flow-node"><b>${esc(step)}</b>${index < value.happyPath.length - 1 ? "<i>→</i>" : ""}</div>`).join("")}</div></section>
      <section class="recovery-rule"><span>Recovery rule</span><p>${esc(value.recoveryRule)}</p></section>
      <div class="decision-grid">${value.decisions.map((item) => `<article class="artifact-card"><p class="eyebrow">DECISION · ${esc(item.at)}</p><h3>${esc(item.question)}</h3><dl><div><dt>YES</dt><dd>${esc(item.yes)}</dd></div><div><dt>NO</dt><dd>${esc(item.no)}</dd></div></dl></article>`).join("")}</div>${revisionNote(value)}`;
  }

  function renderScreenStructure(value) {
    return `<div class="screen-structure">${value.screens.map((screen, index) => `<article class="screen-card"><header><span>0${index + 1}</span><b>${esc(screen.name)}</b></header><p>${esc(screen.purpose)}</p><div class="screen-wire"><i></i><strong>${esc(screen.primary)}</strong>${screen.sections.map((section) => `<small>${esc(section)}</small>`).join("")}</div></article>`).join("")}</div>
      <section class="shared-rules artifact-card"><p class="eyebrow">SHARED RULES</p><ul>${value.sharedRules.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>${revisionNote(value)}`;
  }

  function revisionNote(value) {
    return value.agentRevision ? `<div class="revision-note"><b>Agent revision</b><p>${esc(value.agentRevision)}</p></div>` : "";
  }

  function renderArtifactActions(key, browsing) {
    if (browsing) return "";
    if (state.editingKey === key) {
      const current = artifactValue(key);
      return `<section class="json-editor"><label for="artifact-json-editor">Edit artifact data</label><textarea id="artifact-json-editor" rows="14" spellcheck="false">${esc(JSON.stringify(current, null, 2))}</textarea><div><button class="outline" type="button" data-action="cancel-edit">Cancel</button><button class="primary" type="button" data-action="save-artifact" data-key="${key}">Save edits</button></div></section>`;
    }
    return `<div class="artifact-actions"><button class="outline" type="button" data-action="edit-artifact" data-key="${key}">Edit</button><button class="outline" type="button" data-action="regenerate" data-key="${key}">Regenerate</button><button class="outline" type="button" data-action="toggle-revision" data-key="${key}">Ask Agent</button><button class="primary" type="button" data-action="approve-artifact" data-key="${key}">Approve & Continue</button></div>${state.revisionKey === key ? renderRevisionBox(key) : ""}`;
  }

  function renderRevisionBox(key) {
    return `<section class="revision-box"><label for="revision-instruction">Ask Agent to revise</label><textarea id="revision-instruction" rows="3" placeholder="例如：把恢复路径写得更具体，并减少家长视角"></textarea><div><button class="outline" type="button" data-action="toggle-revision" data-key="${key}">Cancel</button><button class="primary" type="button" data-action="submit-revision" data-key="${key}">Update artifact</button></div></section>`;
  }

  function renderPrototype(key, browsing) {
    const prototype = artifactValue(key);
    const versionKey = key === "prototypeV2" ? "v2" : "v1";
    if (!browsing) state.selectedVersion = versionKey;
    setCanvasHeading(browsing ? "OUTPUT ARCHIVE" : "MOCK PROTOTYPE", ARTIFACT_LABELS[key], `<span class="meta-chip">${esc(prototype.version)} · ${prototype.settings.touchTarget}px targets</span>`);
    dom.canvas.innerHTML = `${browsing ? archiveNotice() : ""}
      ${state.outputs.prototypes.v2 ? `<div class="version-switch"><button type="button" data-action="select-version" data-version="v1" class="${state.selectedVersion === "v1" ? "active" : ""}">Prototype V1</button><button type="button" data-action="select-version" data-version="v2" class="${state.selectedVersion === "v2" ? "active" : ""}">Prototype V2 <span>current</span></button></div>` : ""}
      <div class="prototype-layout">
        ${renderPhone(prototype)}
        <aside class="prototype-notes">
          <p class="eyebrow">STRATEGY MAP</p>
          ${(prototype.strategyMap || []).map((item) => { const principle = Array.isArray(item) ? item[0] : item.principle; const element = Array.isArray(item) ? item[1] : item.element; return `<article><b>${esc(principle)}</b><span>${esc(element)}</span></article>`; }).join("")}
          <dl><div><dt>Home choices</dt><dd>${prototype.settings.homeChoiceCount}</dd></div><div><dt>Touch target</dt><dd>${prototype.settings.touchTarget}px</dd></div><div><dt>Resume priority</dt><dd>${esc(prototype.settings.resumePriority)}</dd></div></dl>
          ${(prototype.appliedChanges || []).length ? `<section class="change-list"><p class="eyebrow">APPLIED FIX</p><ul>${prototype.appliedChanges.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>` : ""}
        </aside>
      </div>
      ${browsing ? "" : prototype.version === "V1" ? renderArtifactActions("prototypeV1", false).replace("Approve & Continue", "Approve & Review") : renderPrototypeV2Actions()}`;
  }

  function renderPrototypeV2Actions() {
    if (state.editingKey === "prototypeV2") {
      return `<section class="json-editor"><label for="artifact-json-editor">Edit artifact data</label><textarea id="artifact-json-editor" rows="14" spellcheck="false">${esc(JSON.stringify(state.outputs.prototypes.v2, null, 2))}</textarea><div><button class="outline" type="button" data-action="cancel-edit">Cancel</button><button class="primary" type="button" data-action="save-artifact" data-key="prototypeV2">Save edits</button></div></section>`;
    }
    return `<div class="artifact-actions"><button class="outline" type="button" data-action="edit-artifact" data-key="prototypeV2">Edit</button><button class="outline" type="button" data-action="regenerate" data-key="prototypeV2">Regenerate</button><button class="outline" type="button" data-action="toggle-revision" data-key="prototypeV2">Ask Agent</button><button class="primary" type="button" data-action="rereview">Re-review V2</button></div>${state.revisionKey === "prototypeV2" ? renderRevisionBox("prototypeV2") : ""}`;
  }

  function renderPhone(prototype) {
    const screen = state.prototypeScreen || "home";
    const navigation = prototype.ui?.navigation || [{ key: "home", label: "Home" }, { key: "reading", label: "Primary" }, { key: "progress", label: "Progress" }];
    return `<div class="prototype-phone" style="--target:${prototype.settings.touchTarget}px">
      <div class="prototype-device-bar"><span>9:41</span><i></i><b>•••</b></div>
      <div class="prototype-screen">${renderPhoneScreen(prototype, screen)}</div>
      <nav aria-label="Prototype screen switcher">
        ${navigation.map(({ key: id, label }) => `<button type="button" data-action="select-screen" data-screen="${esc(id)}" class="${screen === id ? "active" : ""}"><i></i><span>${esc(label)}</span></button>`).join("")}
      </nav>
    </div>`;
  }

  function renderPhoneScreen(prototype, screen) {
    const ui = prototype.ui || localDemoProvider.generatePrototype({ project: state.project }, { version: 1 }).ui;
    if (screen === "reading") {
      const isV2 = prototype.version === "V2";
      const primary = ui.primaryScreen;
      return `<section class="phone-reading ${isV2 ? "is-v2" : ""}">
        <header><button type="button" aria-label="返回">‹</button><span>${esc(primary.eyebrow)}</span><button type="button" aria-label="更多">•••</button></header>
        <div class="reading-progress"><i style="width:34%"></i></div>
        <article><h2>${esc(primary.title)}</h2>${primary.body.map((item) => `<p>${esc(item)}</p>`).join("")}</article>
        <div class="pause-card"><small>${esc(primary.pausedLabel)}</small><h3>${esc(isV2 ? `准备好时，${primary.pausedTitle}` : primary.pausedTitle)}</h3><button class="${isV2 ? "resume-primary" : "resume-secondary"}" type="button">${esc(prototype.settings.recoveryCopy || primary.primaryAction)}</button>${isV2 || !primary.secondaryActions.length ? "" : `<div>${primary.secondaryActions.map((item) => `<button type="button">${esc(item)}</button>`).join("")}</div>`}</div>
      </section>`;
    }
    if (screen === "progress") {
      const progress = ui.progressScreen;
      return `<section class="phone-progress"><div class="completion-orbit"><span>✓</span></div><small>${esc(progress.eyebrow)}</small><h2>${esc(progress.title)}</h2><p>${esc(progress.summary)}</p><div class="progress-stats">${progress.stats.map((item) => `<div><b>${esc(item.value)}</b><span>${esc(item.label)}</span></div>`).join("")}</div><button type="button">${esc(progress.action)}</button></section>`;
    }
    const choices = prototype.settings.homeChoiceCount;
    const visibleRecommendations = ui.recommendations.slice(0, Math.min(choices, 6));
    return `<section class="phone-home"><header><div><small>${esc(ui.greeting)}</small><h2>${esc(ui.homeTitle)}</h2></div><img src="assets/phone/avatar.png" alt="${esc(ui.userName)}" /></header><article class="continue-card"><span>${esc(ui.continuation.eyebrow)}</span><h3>${esc(ui.continuation.title)}</h3><p>${esc(ui.continuation.meta)}</p><button type="button">${esc(ui.continuation.action)}</button></article><div class="choice-head"><h3>${esc(`${choices} 个建议入口`)}</h3><span>${esc(ui.productLabel)}</span></div><div class="book-row">${visibleRecommendations.map((item, index) => `<button type="button"><span class="rec-visual tone-${esc(item.tone)}">${esc(item.title.slice(0, 1) || String(index + 1))}</span><span>${esc(item.title)}</span><small>${esc(item.subtitle)}</small></button>`).join("")}</div></section>`;
  }

  function renderReview(key, browsing) {
    const review = artifactValue(key);
    setCanvasHeading(browsing ? "OUTPUT ARCHIVE" : "AI REVIEW", `Review Round ${review.round} · ${review.prototypeVersion}`, `<span class="meta-chip ${review.round === 1 ? "warning" : "success"}">${review.issues.filter((item) => item.status === "open").length} open issues</span>`);
    dom.canvas.innerHTML = `${browsing ? archiveNotice() : ""}<section class="review-summary"><div><p class="eyebrow">REVIEW SUMMARY</p><h2>${esc(review.summary)}</h2></div><span>${review.issues.filter((item) => ["pass", "resolved"].includes(item.status)).length}/${review.issues.length} passed</span></section>
      <div class="review-list">${review.issues.map((issue) => renderIssue(issue, review.round, browsing)).join("")}</div>
      ${browsing ? "" : review.round === 2 ? `<div class="artifact-actions"><button class="outline" type="button" data-action="view-artifact" data-key="prototypeV1">Compare V1</button><button class="primary" type="button" data-action="complete">Complete Task</button></div>` : ""}`;
  }

  function renderIssue(issue, round, browsing) {
    const actionable = round === 1 && ["open", "ignored", "fixed-in-v2", "fixing"].includes(issue.status);
    return `<article class="review-issue ${esc(issue.status)}">
      <header><div><span class="severity ${esc(issue.severity)}">${esc(issue.severity)}</span><h3>${esc(issue.category)}</h3></div><b>${esc(issue.status)}</b></header>
      <div class="issue-grid"><div><small>SCREEN</small><p>${esc(issue.screen)}</p></div><div><small>PROBLEM</small><p>${esc(issue.problem)}</p></div><div><small>WHY IT MATTERS</small><p>${esc(issue.reason)}</p></div><div><small>RECOMMENDATION</small><p>${esc(issue.recommendation)}</p></div></div>
      ${!browsing && actionable ? `<footer>${issue.status === "open" ? `<button class="outline" type="button" data-action="ignore-issue" data-id="${issue.id}">Ignore</button><button class="primary" type="button" data-action="apply-fix" data-id="${issue.id}">Apply Fix</button>` : issue.status === "ignored" ? `<button class="outline" type="button" data-action="reopen-issue" data-id="${issue.id}">Re-open issue</button><button class="primary" type="button" data-action="complete-without-fix">Complete without fix</button>` : `<span>Prototype V2 已记录本项修复</span>`}</footer>` : ""}
    </article>`;
  }

  function renderStopped() {
    setCanvasHeading("TASK STOPPED", "任务状态已冻结", '<span class="meta-chip warning">blocked</span>');
    dom.canvas.innerHTML = `<section class="stopped-state"><span>Ⅱ</span><h2>No delayed writes</h2><p>Agent Runtime 已取消当前 pending token。Brief、Context、Plan、Outputs、Reviews 与 Iterations 均保留在本机。</p><dl><div><dt>Stopped at</dt><dd>${esc(nowLabel())}</dd></div><div><dt>Resume to</dt><dd>${esc(state.statusBeforeStop || "current step")}</dd></div></dl><button class="primary" type="button" data-action="resume">Resume Task</button></section>`;
  }

  function renderComplete() {
    setCanvasHeading("COMPLETE", "设计任务已完成", '<span class="meta-chip success">Saved locally</span>');
    const hasV2 = Boolean(state.outputs.prototypes.v2);
    dom.canvas.innerHTML = `<section class="complete-hero"><span>✓</span><p class="eyebrow">FINAL OUTPUT</p><h2>${hasV2 ? "Prototype V2 passed re-review" : "Prototype V1 completed by human decision"}</h2><p>${hasV2 ? "完整 Golden Path 已结束。V1/V2、两轮 Review、修复记录与批准历史都已保存。" : "用户选择忽略问题并完成任务；该决策已保存在 Review 与 History 中。"}</p><div><button class="outline" type="button" data-action="open-history">Open History</button><button class="primary" type="button" data-action="export">Export JSON</button></div></section>
      <div class="completion-grid"><article><span>Brief</span><b>${state.brief.approved ? "Approved" : "Draft"}</b></article><article><span>Outputs</span><b>${[state.outputs.userInsight, state.outputs.experiencePrinciples, state.outputs.userFlow, state.outputs.screenStructure].filter(Boolean).length}/4</b></article><article><span>Prototypes</span><b>${hasV2 ? "V1 + V2" : "V1"}</b></article><article><span>Reviews</span><b>${state.reviews.length} rounds</b></article></div>
      <section class="final-links"><button type="button" data-action="view-artifact" data-key="prototypeV1">Prototype V1</button>${hasV2 ? '<button type="button" data-action="view-artifact" data-key="prototypeV2">Prototype V2</button>' : ""}<button type="button" data-action="view-artifact" data-key="${hasV2 ? "reviewV2" : "reviewV1"}">Final Review</button></section>`;
  }

  function renderFooter() {
    const config = footerConfig();
    dom.footerState.textContent = state.runtime.isRunning ? "Agent working" : statusLabel(state.status);
    dom.footerNext.textContent = state.view && state.view !== CURRENT_ARTIFACT[state.status] ? "正在查看已保存产物；返回当前步骤后继续" : config.next;
    dom.footerPrimary.textContent = state.view && state.view !== CURRENT_ARTIFACT[state.status] ? "Return to current" : config.label;
    dom.footerPrimary.disabled = Boolean(config.disabled);
    dom.stop.disabled = !state.id || ["complete", "stopped"].includes(state.status) || (state.status === "creating" && !state.runtime.isRunning);
    dom.export.disabled = state.status !== "complete";
    document.body.classList.toggle("agent-running", Boolean(state.runtime.isRunning));
  }

  function statusLabel(status) {
    return ({
      creating: "等待创建", "needs-input": "需要信息", "brief-approval": "等待批准", "user-insight": "等待批准", "experience-principles": "等待批准", "user-flow": "等待批准", "screen-structure": "等待批准", "prototype-v1": "Prototype V1", "review-v1": "Review decision", "prototype-v2": "Prototype V2", "review-v2": "Ready to complete", complete: "Completed", stopped: "Stopped",
    })[status] || status;
  }

  function openHistory() {
    renderHistoryList();
    if (typeof dom.historyDialog.showModal === "function") dom.historyDialog.showModal();
    else dom.historyDialog.setAttribute("open", "");
  }

  function renderHistoryList() {
    const items = readHistory();
    dom.historyList.innerHTML = items.length ? items.map((entry) => `<article class="history-entry"><div><span>${esc(entry.state?.outputs?.prototypes?.v2 ? "V2" : "V1")}</span><h3>${esc(entry.name)}</h3><p>${esc(entry.state?.project?.goal || "")}</p><time>${esc(new Date(entry.completedAt).toLocaleString("zh-CN"))}</time></div><button class="outline" type="button" data-action="load-history" data-id="${esc(entry.id)}">Load</button></article>`).join("") : `<div class="history-empty"><span>00</span><h3>尚无已完成项目</h3><p>完成一次设计任务后会保留最近五条记录。</p></div>`;
  }

  function loadHistoryEntry(id) {
    const entry = readHistory().find((item) => item.id === id);
    if (!entry?.state) return;
    runtime.cancelPending();
    state = migrateLoadedState(deepClone(entry.state));
    if (!state) return;
    persistActive();
    dom.historyDialog.close?.();
    render();
    showToast("完整项目状态已从 History 恢复", "success");
  }

  function exportProject() {
    if (state.status !== "complete") {
      showToast("完成任务后才能导出最终 JSON", "error");
      return;
    }
    const payload = {
      schema: "design-copilot-functional-mvp/v2.1",
      exportedAt: new Date().toISOString(),
      project: state.project,
      brief: state.brief,
      context: state.context,
      missingContext: state.missingContext,
      plan: state.plan,
      currentStep: state.currentStep,
      outputs: state.outputs,
      reviews: state.reviews,
      iterations: state.iterations,
      history: state.history,
      status: state.status,
      provider: {
        runtime: "AgentRuntime",
        active: state.runtime.provider,
        model: state.runtime.providerMeta?.model || null,
        fallbackUsed: state.runtime.provider === "local-demo",
        implementations: ["LLMProvider", "LocalDemoProvider"],
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug(state.project.projectName)}-design-copilot-v2.1.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("JSON exported", "success");
  }

  async function shareProject() {
    if (!state.project) {
      showToast("请先创建项目", "error");
      return;
    }
    const text = `${state.project.projectName}\n${state.project.goal || state.project.productDescription}\nStatus: ${statusLabel(state.status)}`;
    try {
      if (navigator.share) await navigator.share({ title: state.project.projectName, text });
      else await navigator.clipboard.writeText(text);
      showToast(navigator.share ? "Share sheet opened" : "Project summary copied", "success");
    } catch (error) {
      if (error?.name !== "AbortError") showToast("无法分享，请稍后重试", "error");
    }
  }

  function openNewProject() {
    if (!state.id || state.status === "creating") return confirmNewProject();
    if (typeof dom.confirmDialog.showModal === "function") dom.confirmDialog.showModal();
    else dom.confirmDialog.setAttribute("open", "");
  }

  function confirmNewProject() {
    runtime.cancelPending();
    state = createInitialState();
    persistActive();
    dom.confirmDialog.close?.();
    render();
  }

  function applyPreset(presetKey) {
    const preset = PRESETS[presetKey];
    const form = document.querySelector("#project-form");
    if (!preset || !form) return;
    state.selectedPreset = presetKey;
    for (const field of ["projectName", "productDescription", "targetUsers", "platform", "goal", "constraints", "additionalContext"]) {
      form.elements[field].value = preset[field];
    }
  }

  document.addEventListener("submit", (event) => {
    if (event.target.matches("#project-form")) {
      event.preventDefault();
      createProjectFromForm();
    }
    if (event.target.matches("#context-form")) {
      event.preventDefault();
      updateContextFromForm();
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("#preset-select")) applyPreset(event.target.value);
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    const key = button.dataset.key;
    if (action === "footer-primary") handleFooterPrimary();
    if (action === "stop") stopTask();
    if (action === "resume") resumeTask();
    if (action === "save-brief") syncBriefForm();
    if (action === "approve-brief") approveBrief();
    if (action === "approve-artifact") key === "prototypeV1" ? approvePrototypeV1() : approveArtifact(key);
    if (action === "edit-artifact") { state.editingKey = key; render(); }
    if (action === "cancel-edit") { state.editingKey = null; render(); }
    if (action === "save-artifact") saveArtifactEdit(key);
    if (action === "regenerate") regenerateArtifact(key);
    if (action === "toggle-revision") { state.revisionKey = state.revisionKey === key ? null : key; render(); }
    if (action === "submit-revision") submitRevision(key);
    if (action === "apply-fix") applyFix(button.dataset.id);
    if (action === "ignore-issue") ignoreIssue(button.dataset.id);
    if (action === "reopen-issue") reopenIssue(button.dataset.id);
    if (action === "complete-without-fix") completeTask(true);
    if (action === "rereview") reReviewV2();
    if (action === "complete") completeTask(false);
    if (action === "view-artifact") { state.view = key; render(); }
    if (action === "return-current") { state.view = null; render(); }
    if (action === "select-screen") { state.prototypeScreen = button.dataset.screen; persistActive(); render(); }
    if (action === "select-version") { state.selectedVersion = button.dataset.version; state.view = button.dataset.version === "v2" ? "prototypeV2" : "prototypeV1"; render(); }
    if (action === "open-history") openHistory();
    if (action === "load-history") loadHistoryEntry(button.dataset.id);
    if (action === "close-dialog") button.closest("dialog")?.close?.();
    if (action === "export") exportProject();
    if (action === "share") shareProject();
    if (action === "new-project") openNewProject();
    if (action === "confirm-new") confirmNewProject();
    if (action === "retry-ai") runtime.retry({ forceLLM: true });
    if (action === "use-demo") runtime.retry({ forceLocal: true });
    if (action === "dismiss-provider-warning") { state.runtime.providerWarning = null; persistActive(); render(); }
  });

  [dom.historyDialog, dom.confirmDialog].forEach((dialog) => dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close?.();
  }));

  window.DesignCopilotDebug = {
    getState: () => deepClone(state),
    getHistory: () => deepClone(readHistory()),
    waitForIdle: () => runtime.lastPromise,
    retryWithLLM: () => runtime.retry({ forceLLM: true }),
    retryWithLocalDemo: () => runtime.retry({ forceLocal: true }),
    clearDemoData: () => { localStorage.removeItem(ACTIVE_KEY); localStorage.removeItem(HISTORY_KEY); window.location.reload(); },
    storageKeys: { active: ACTIVE_KEY, history: HISTORY_KEY },
  };

  render();
})();
