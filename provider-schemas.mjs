const stringArray = (minItems = 1, maxItems = 8) => ({
  type: "array",
  items: { type: "string" },
  minItems,
  maxItems,
});

const strictObject = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const briefSchema = strictObject({
  goal: { type: "string" },
  targetUser: { type: "string" },
  productType: { type: "string" },
  platform: { type: "string" },
  mainProblem: { type: "string" },
  constraints: { type: "string" },
  missingContext: stringArray(0, 3),
});

export const schemas = {
  understandProject: {
    name: "project_understanding",
    schema: strictObject({
      brief: briefSchema,
      missingContext: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: strictObject({
          field: { type: "string", enum: ["productDescription", "targetUsers", "platform", "goal", "constraints", "additionalContext"] },
          prompt: { type: "string" },
          placeholder: { type: "string" },
        }),
      },
      analysisSummary: { type: "string" },
    }),
  },
  generateInsights: {
    name: "user_insight",
    schema: strictObject({
      goals: stringArray(2, 6),
      behaviors: stringArray(2, 6),
      painPoints: stringArray(2, 6),
      cognitiveNeeds: stringArray(2, 6),
      implications: stringArray(2, 6),
    }),
  },
  generatePrinciples: {
    name: "experience_principles",
    schema: strictObject({
      principles: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: strictObject({ title: { type: "string" }, detail: { type: "string" } }),
      },
    }),
  },
  generateUserFlow: {
    name: "user_flow",
    schema: strictObject({
      happyPath: stringArray(4, 10),
      recoveryRule: { type: "string" },
      decisions: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: strictObject({ at: { type: "string" }, question: { type: "string" }, yes: { type: "string" }, no: { type: "string" } }),
      },
    }),
  },
  generateScreenStructure: {
    name: "screen_structure",
    schema: strictObject({
      screens: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: strictObject({
          name: { type: "string" },
          purpose: { type: "string" },
          primary: { type: "string" },
          sections: stringArray(2, 6),
        }),
      },
      sharedRules: stringArray(2, 6),
    }),
  },
  generatePrototype: {
    name: "mock_prototype",
    schema: strictObject({
      version: { type: "string", enum: ["V1", "V2"] },
      settings: strictObject({
        homeChoiceCount: { type: "integer" },
        touchTarget: { type: "integer" },
        resumePriority: { type: "string", enum: ["primary", "secondary"] },
        recoveryCopy: { type: "string" },
      }),
      ui: strictObject({
        productLabel: { type: "string" },
        userName: { type: "string" },
        greeting: { type: "string" },
        homeTitle: { type: "string" },
        continuation: strictObject({
          eyebrow: { type: "string" },
          title: { type: "string" },
          meta: { type: "string" },
          action: { type: "string" },
        }),
        recommendations: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: strictObject({ title: { type: "string" }, subtitle: { type: "string" }, tone: { type: "string", enum: ["sage", "sand", "blue", "rose", "slate", "amber"] } }),
        },
        primaryScreen: strictObject({
          eyebrow: { type: "string" },
          title: { type: "string" },
          body: stringArray(1, 4),
          pausedLabel: { type: "string" },
          pausedTitle: { type: "string" },
          primaryAction: { type: "string" },
          secondaryActions: stringArray(0, 3),
        }),
        progressScreen: strictObject({
          eyebrow: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          stats: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: strictObject({ value: { type: "string" }, label: { type: "string" } }),
          },
          action: { type: "string" },
        }),
        navigation: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: strictObject({ key: { type: "string", enum: ["home", "reading", "progress"] }, label: { type: "string" } }),
        },
      }),
      strategyMap: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: strictObject({ principle: { type: "string" }, element: { type: "string" } }),
      },
      appliedChanges: stringArray(0, 8),
    }),
  },
  reviewPrototype: {
    name: "prototype_review",
    schema: strictObject({
      summary: { type: "string" },
      issues: {
        type: "array",
        minItems: 6,
        maxItems: 8,
        items: strictObject({
          category: { type: "string", enum: ["Information Hierarchy", "Cognitive Load", "Interaction Clarity", "Accessibility", "Task Completion", "Consistency"] },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          screen: { type: "string" },
          problem: { type: "string" },
          reason: { type: "string" },
          recommendation: { type: "string" },
          status: { type: "string", enum: ["open", "pass", "resolved"] },
        }),
      },
    }),
  },
};

export const artifactSchemas = {
  brief: { name: "revised_brief", schema: briefSchema },
  userInsight: { name: "revised_user_insight", schema: schemas.generateInsights.schema },
  experiencePrinciples: { name: "revised_experience_principles", schema: schemas.generatePrinciples.schema },
  userFlow: { name: "revised_user_flow", schema: schemas.generateUserFlow.schema },
  screenStructure: { name: "revised_screen_structure", schema: schemas.generateScreenStructure.schema },
  prototypeV1: { name: "revised_prototype_v1", schema: schemas.generatePrototype.schema },
  prototypeV2: { name: "revised_prototype_v2", schema: schemas.generatePrototype.schema },
};

export function schemaFor(operation, artifactKind) {
  if (operation === "reviseArtifact") return artifactSchemas[artifactKind] || null;
  return schemas[operation] || null;
}

export function validateAgainstSchema(schema, value, path = "$") {
  const errors = [];
  const fail = (message) => errors.push(`${path}: ${message}`);
  if (!schema) return [`${path}: schema missing`];

  if (schema.enum && !schema.enum.includes(value)) fail(`expected one of ${schema.enum.join(", ")}`);
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail("expected object");
      return errors;
    }
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key}: required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties || {}, key)) errors.push(`${path}.${key}: unexpected property`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) errors.push(...validateAgainstSchema(childSchema, value[key], `${path}.${key}`));
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) {
      fail("expected array");
      return errors;
    }
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) fail(`expected at least ${schema.minItems} items`);
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) fail(`expected no more than ${schema.maxItems} items`);
    value.forEach((item, index) => errors.push(...validateAgainstSchema(schema.items, item, `${path}[${index}]`)));
  } else if (schema.type === "string") {
    if (typeof value !== "string") fail("expected string");
  } else if (schema.type === "integer") {
    if (!Number.isInteger(value)) fail("expected integer");
  } else if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) fail("expected number");
  } else if (schema.type === "boolean") {
    if (typeof value !== "boolean") fail("expected boolean");
  }
  return errors;
}
