export const projects = {
  reading: {
    projectName: "Focus Reader",
    productDescription: "为 8–12 岁 ADHD 儿童设计低认知负荷阅读产品，帮助开始阅读、分心后恢复并完成短章节。",
    targetUsers: "8–12 岁 ADHD 儿童及陪伴阅读的家长",
    platform: "iOS / iPadOS",
    goal: "提高 10 分钟阅读任务完成率",
    constraints: "不使用高刺激动效；核心触控区至少 48px",
    additionalContext: "保存页码，恢复时只显示一个明确按钮",
  },
  commerce: {
    projectName: "Seller Command Center",
    productDescription: "为跨境电商运营团队设计桌面后台，集中处理异常订单、库存冲突和批量履约。",
    targetUsers: "每天处理数百订单的电商运营与仓储协调员",
    platform: "Desktop Web 1440px",
    goal: "把异常订单的发现与批量处理时间降低 40%",
    constraints: "沿用现有订单数据模型；关键操作需要审计记录；满足 WCAG AA",
    additionalContext: "高峰期多人协作，订单状态可能并发变化",
  },
};

function isCommerce(context) {
  return /电商|订单|库存|Seller/i.test(JSON.stringify(context || {}));
}

function basePrototype(commerce, version = "V1") {
  const fixed = version === "V2";
  return {
    version,
    settings: {
      homeChoiceCount: fixed ? 3 : 6,
      touchTarget: fixed ? 52 : 40,
      resumePriority: fixed ? "primary" : "secondary",
      recoveryCopy: commerce ? "处理 8 个订单" : "继续第 4 页",
    },
    ui: commerce ? {
      productLabel: "SELLER COMMAND CENTER",
      userName: "运营团队",
      greeting: "早上好，运营团队",
      homeTitle: "先处理履约风险",
      continuation: { eyebrow: "12 ORDERS · HIGH RISK", title: "异常订单待处理", meta: "5 个地址问题 · 7 个库存冲突", action: "查看异常订单" },
      recommendations: [
        { title: "待发货", subtitle: "128 单", tone: "blue" },
        { title: "库存冲突", subtitle: "9 SKU", tone: "rose" },
        { title: "退款申请", subtitle: "17 单", tone: "sand" },
      ],
      primaryScreen: { eyebrow: "ORDER WORKBENCH", title: "已选择 12 个异常订单", body: ["8 个订单可以重新分配库存。", "4 个订单需要联系客户。"], pausedLabel: "BULK ACTION READY", pausedTitle: "确认批量操作影响", primaryAction: "处理 8 个订单", secondaryActions: ["导出列表", "分配成员"] },
      progressScreen: { eyebrow: "OPERATION COMPLETE", title: "8 个订单已更新", summary: "4 个冲突订单保留在队列", stats: [{ value: "8", label: "updated" }, { value: "4", label: "conflicts" }, { value: "2m", label: "saved" }], action: "继续处理" },
      navigation: [{ key: "home", label: "概览" }, { key: "reading", label: "订单" }, { key: "progress", label: "结果" }],
    } : {
      productLabel: "FOCUS READER",
      userName: "Milo",
      greeting: "下午好，Milo",
      homeTitle: "继续你的故事",
      continuation: { eyebrow: "FOREST STORY · 34%", title: "森林里的小秘密", meta: "第 2 章 · 第 4 页", action: "继续阅读" },
      recommendations: [
        { title: "慢慢找路", subtitle: "8 分钟", tone: "sage" },
        { title: "云朵朋友", subtitle: "6 分钟", tone: "blue" },
        { title: "安静星球", subtitle: "10 分钟", tone: "sand" },
      ],
      primaryScreen: { eyebrow: "CHAPTER 2 · 4 / 12", title: "小狐狸停在发光的树下", body: ["叶子轻轻地说：慢一点，也可以找到路。"], pausedLabel: "READING PAUSED", pausedTitle: "阅读已暂停", primaryAction: "继续第 4 页", secondaryActions: ["听一听", "设置"] },
      progressScreen: { eyebrow: "READING COMPLETE", title: "你读完了一个章节", summary: "今天专注阅读 8 分钟", stats: [{ value: "12", label: "pages" }, { value: "1", label: "pause" }, { value: "100%", label: "returned" }], action: "回到首页" },
      navigation: [{ key: "home", label: "首页" }, { key: "reading", label: "阅读" }, { key: "progress", label: "进度" }],
    },
    strategyMap: commerce
      ? [{ principle: "Risk before volume", element: "异常订单主卡" }, { principle: "Bulk with confidence", element: "批量影响确认" }, { principle: "Status is a contract", element: "操作结果" }]
      : [{ principle: "One decision at a time", element: "继续阅读卡" }, { principle: "Return without penalty", element: "恢复阅读状态" }, { principle: "Progress you can feel", element: "章节反馈" }],
    appliedChanges: fixed ? [commerce ? "把批量处理提升为唯一主行动" : "把继续阅读提升为唯一主行动", "触控区域扩大到 52px", "首屏入口收敛为 3 个"] : [],
  };
}

export function resultFor(operation, payload = {}, artifactKind) {
  const context = payload.context || {};
  const commerce = isCommerce(context);
  const project = context.project || {};
  if (operation === "understandProject") {
    const missing = [];
    if (!project.constraints) missing.push({ field: "constraints", prompt: commerce ? "批量订单操作需要哪些权限和审计限制？" : "阅读体验需要遵守哪些刺激与触控限制？", placeholder: commerce ? "例如：只有主管可确认，并记录操作者" : "例如：不使用高刺激动效；触控区至少 48px" });
    if (!project.additionalContext) missing.push({ field: "additionalContext", prompt: commerce ? "订单并发变化时应怎样处理冲突？" : "孩子分心后应怎样恢复？", placeholder: commerce ? "例如：确认前重新校验订单状态" : "例如：保存页码并显示单一恢复按钮" });
    return {
      brief: {
        goal: project.goal || "待补充",
        targetUser: project.targetUsers || "待补充",
        productType: commerce ? "跨境电商运营后台" : "ADHD 儿童低认知负荷阅读产品",
        platform: project.platform || "待补充",
        mainProblem: commerce ? "异常订单、库存与履约信息分散，批量处理风险高。" : "孩子难以开始阅读，分心后也难以恢复到原位置。",
        constraints: project.constraints || "待补充",
        missingContext: missing.map((item) => item.prompt),
      },
      missingContext: missing,
      analysisSummary: missing.length ? `还需确认 ${missing.length} 项设计约束。` : commerce ? "运营角色、批量履约目标和并发约束完整。" : "儿童阅读目标、低刺激约束和恢复规则完整。",
    };
  }
  if (operation === "generateInsights") return commerce ? {
    goals: ["快速定位高风险异常订单", "安全地批量处理履约动作", "追踪多人协作结果"],
    behaviors: ["先扫描异常数量和严重度", "筛选后批量处理同类订单", "在订单与库存之间反复核对"],
    painPoints: ["风险分散在多个模块", "并发状态导致批量操作失败", "操作责任与结果难追溯"],
    cognitiveNeeds: ["风险优先层级", "影响范围确认", "可恢复的筛选上下文"],
    implications: ["概览先展示异常而非 GMV", "确认前重新校验订单状态", "结果按成功与冲突分组"],
  } : {
    goals: ["独立开始短时阅读", "分心后无压力回到原页", "看见可理解的章节进度"],
    behaviors: ["先看图和短标题再选择", "长段文本出现时容易切换", "偶尔需要家长协助"],
    painPoints: ["选择过多会延迟开始", "控制项争夺注意力", "暂停后找不到原位置"],
    cognitiveNeeds: ["单一主行动", "短句和稳定层级", "低刺激恢复反馈"],
    implications: ["首页推荐控制在三个", "恢复按钮显示具体页码", "完成反馈强调过程"],
  };
  if (operation === "generatePrinciples") return { principles: commerce ? [
    { title: "Risk before volume", detail: "先呈现需要行动的异常，再呈现总体业务数字。" },
    { title: "Bulk with confidence", detail: "批量操作明确对象、影响和冲突。" },
    { title: "Preserve operator context", detail: "跨模块保留筛选与选择。" },
    { title: "Status is auditable", detail: "每个变化都有操作者、时间和结果。" },
  ] : [
    { title: "One decision at a time", detail: "每屏只要求孩子做一个主要决定。" },
    { title: "Return without penalty", detail: "分心是正常状态，恢复路径始终清楚。" },
    { title: "Progress you can feel", detail: "用短章节和位置记忆呈现进度。" },
    { title: "Calm, not empty", detail: "稳定结构配合适量视觉线索。" },
  ] };
  if (operation === "generateUserFlow") return commerce ? {
    happyPath: ["Operations Overview", "Review Alert", "Open Orders", "Select Orders", "Confirm Live Status", "Apply Bulk Action", "Track Result"],
    recoveryRule: "保留筛选、选择和操作草稿；恢复时重新校验订单实时状态。",
    decisions: [{ at: "Review Alert", question: "需要立即处理？", yes: "Open affected orders", no: "Assign or snooze" }, { at: "Confirm Live Status", question: "订单仍可修改？", yes: "Apply action", no: "Remove conflicts" }],
  } : {
    happyPath: ["Home", "Choose Book", "Reading", "Pause", "Resume Exact Page", "Complete Chapter", "Gentle Feedback"],
    recoveryRule: "保存页码、时长和显示设置；下一次只需一次操作即可恢复。",
    decisions: [{ at: "Home", question: "继续上次阅读？", yes: "Resume exact page", no: "Choose book" }, { at: "Pause", question: "孩子准备好继续？", yes: "Resume", no: "Keep progress saved" }],
  };
  if (operation === "generateScreenStructure") return commerce ? {
    screens: [
      { name: "Operations Overview", purpose: "先识别履约风险", primary: "查看异常订单", sections: ["风险摘要", "待处理队列", "业务指标"] },
      { name: "Order Workbench", purpose: "筛选并批量处理订单", primary: "应用批量动作", sections: ["筛选与选择", "订单表格", "影响确认"] },
      { name: "Operation Result", purpose: "确认成功与冲突", primary: "继续处理剩余订单", sections: ["成功记录", "冲突原因", "审计日志"] },
    ], sharedRules: ["风险状态不只依赖颜色", "批量动作显示影响数量", "确认前校验实时状态"],
  } : {
    screens: [
      { name: "Home", purpose: "用一个决定开始阅读", primary: "继续阅读", sections: ["上次位置", "三个推荐", "简化导航"] },
      { name: "Reading", purpose: "维持注意并支持中断", primary: "阅读与恢复", sections: ["章节进度", "短段正文", "暂停控制"] },
      { name: "Completion", purpose: "确认章节完成", primary: "查看本次进度", sections: ["过程反馈", "阅读统计", "返回首页"] },
    ], sharedRules: ["核心触控区至少 48px", "正文保持短行长", "不自动播放高刺激动效"],
  };
  if (operation === "generatePrototype") return basePrototype(commerce, Number(payload.prototypeOptions?.version || 1) === 2 ? "V2" : "V1");
  if (operation === "reviewPrototype") {
    const fixed = payload.prototype?.version === "V2";
    const task = commerce ? "批量订单操作" : "恢复阅读";
    const categories = ["Information Hierarchy", "Cognitive Load", "Interaction Clarity", "Accessibility", "Task Completion", "Consistency"];
    return {
      summary: fixed ? `${task}的关键问题已经解决，六个检查维度通过。` : `${task}入口需要一次明确修复。`,
      issues: categories.map((category, index) => ({
        category,
        severity: index === 2 && !fixed ? "high" : "low",
        screen: index === 2 ? (commerce ? "Order Workbench" : "Reading") : "All",
        problem: index === 2 ? (fixed ? `${task}主行动已清楚。` : `${task}与次级操作同级。`) : `${category}符合当前要求。`,
        reason: index === 2 ? (fixed ? "主行动和触控范围明确。" : "用户需要重新判断下一步。") : "结构与批准产物一致。",
        recommendation: index === 2 ? `把${task}设为唯一主按钮并扩大触控区。` : "保持当前规则。",
        status: index === 2 ? (fixed ? "resolved" : "open") : "pass",
      })),
    };
  }
  if (operation === "reviseArtifact") {
    if (/^prototype/.test(artifactKind || "")) {
      const revised = basePrototype(commerce, artifactKind === "prototypeV2" ? "V2" : "V1");
      revised.ui.primaryScreen.title = commerce ? "确认 8 个订单的实时状态" : "准备好时继续第 4 页";
      revised.appliedChanges = [payload.userInstruction || "已应用用户修改要求"];
      return revised;
    }
    const revised = JSON.parse(JSON.stringify(payload.artifact));
    if (artifactKind === "userInsight") revised.implications[0] = `${commerce ? "批量操作" : "阅读体验"}已按要求重构：${payload.userInstruction}`;
    if (artifactKind === "experiencePrinciples") revised.principles[0].detail = `已按要求重构：${payload.userInstruction}`;
    if (artifactKind === "userFlow") revised.recoveryRule = `已按要求重构：${payload.userInstruction}`;
    if (artifactKind === "screenStructure") revised.sharedRules[0] = `已按要求重构：${payload.userInstruction}`;
    return revised;
  }
  throw new Error(`Unhandled fixture operation: ${operation}`);
}
