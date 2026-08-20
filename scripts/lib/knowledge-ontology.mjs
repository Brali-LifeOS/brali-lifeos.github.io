import { readFile } from "node:fs/promises";
import path from "node:path";

const unique = (values = []) => [...new Set(values.filter(Boolean))];

export async function loadKnowledgeOntology(root) {
  const ontology = JSON.parse(await readFile(path.join(root, "data/knowledge-ontology.json"), "utf8"));
  const areas = JSON.parse(await readFile(path.join(root, "data/life-areas.json"), "utf8"));
  const overrides = JSON.parse(await readFile(path.join(root, "data/ontology-overrides.json"), "utf8"));

  const domains = new Map(ontology.domains.map((item) => [item.id, item]));
  const topics = new Map(ontology.topics.map((item) => [item.id, item]));
  const methods = new Map(ontology.methods.map((item) => [item.id, item]));
  const lenses = new Map(ontology.lenses.map((item) => [item.id, item]));
  const areaByZone = new Map();
  for (const area of areas) for (const zone of area.zones) areaByZone.set(zone, area.slug);

  const legacyAreaMap = ontology.legacy_life_area_map ?? {
    "focus-execution": "focus-action",
    "mind-resilience": "mind-resilience",
    "health-energy": "health-energy",
    "learning-thinking": "learning-thinking",
    "communication-relationships": "communication-relationships",
    "creativity-expression": "creativity-expression",
    "work-money-strategy": "work-money"
  };

  const entity = (registry, id) => {
    const value = registry.get(id);
    if (!value) throw new Error(`Unknown ontology entity: ${id}`);
    return { id: value.id, title: value.title };
  };

  function classifyLegacyZone(zoneSlug) {
    const mapping = ontology.legacy_zone_map?.[zoneSlug];
    if (!mapping) throw new Error(`Legacy zone is not mapped in knowledge ontology: ${zoneSlug}`);
    const lifeAreaSlug = areaByZone.get(zoneSlug);
    if (!lifeAreaSlug) throw new Error(`Legacy zone is not mapped to a life area: ${zoneSlug}`);

    let domainId = legacyAreaMap[lifeAreaSlug];
    const topicIds = [];
    const methodIds = [];
    const lensIds = [];

    if (mapping.kind === "topic") {
      const topic = topics.get(mapping.target_id);
      if (!topic) throw new Error(`Legacy zone ${zoneSlug} references unknown topic ${mapping.target_id}`);
      domainId = topic.domain_id;
      topicIds.push(mapping.target_id);
    } else if (mapping.kind === "method") {
      if (!methods.has(mapping.target_id)) throw new Error(`Legacy zone ${zoneSlug} references unknown method ${mapping.target_id}`);
      methodIds.push(mapping.target_id);
    } else if (mapping.kind === "lens") {
      if (!lenses.has(mapping.target_id)) throw new Error(`Legacy zone ${zoneSlug} references unknown lens ${mapping.target_id}`);
      lensIds.push(mapping.target_id);
    } else {
      throw new Error(`Legacy zone ${zoneSlug} has unsupported ontology kind ${mapping.kind}`);
    }

    if (!domainId || !domains.has(domainId)) throw new Error(`Cannot resolve ontology domain for legacy zone ${zoneSlug}`);

    return {
      domains: [entity(domains, domainId)],
      topics: topicIds.map((id) => entity(topics, id)),
      methods: methodIds.map((id) => entity(methods, id)),
      lenses: lensIds.map((id) => entity(lenses, id)),
      classification_status: topicIds.length ? "topic-mapped" : "topic-pending",
      classification_source: "legacy-zone-map",
      legacy: { life_area_slug: lifeAreaSlug, growth_zone_slug: zoneSlug }
    };
  }

  function buildClassification({ domainIds, topicIds, methodIds, lensIds, source, legacy }) {
    const inferredDomainIds = topicIds.map((id) => {
      const topic = topics.get(id);
      if (!topic) throw new Error(`Record references unknown topic ${id}`);
      return topic.domain_id;
    });
    const resolvedDomainIds = unique([...domainIds, ...inferredDomainIds]);
    for (const id of resolvedDomainIds) if (!domains.has(id)) throw new Error(`Record references unknown domain ${id}`);
    for (const id of methodIds) if (!methods.has(id)) throw new Error(`Record references unknown method ${id}`);
    for (const id of lensIds) if (!lenses.has(id)) throw new Error(`Record references unknown lens ${id}`);

    return {
      domains: resolvedDomainIds.map((id) => entity(domains, id)),
      topics: topicIds.map((id) => entity(topics, id)),
      methods: methodIds.map((id) => entity(methods, id)),
      lenses: lensIds.map((id) => entity(lenses, id)),
      classification_status: topicIds.length ? "explicit" : "topic-pending",
      classification_source: source,
      legacy
    };
  }

  function classifyRecord(record, zoneSlug, slug = record?.slug) {
    const legacy = classifyLegacyZone(zoneSlug);
    const explicitDomainIds = unique(record?.domain_slugs ?? record?.domain_ids ?? []);
    const explicitTopicIds = unique(record?.topic_slugs ?? record?.topic_ids ?? []);
    const explicitMethodIds = unique(record?.method_slugs ?? record?.method_ids ?? []);
    const explicitLensIds = unique(record?.lens_slugs ?? record?.lens_ids ?? []);
    const hasExplicit = explicitDomainIds.length || explicitTopicIds.length || explicitMethodIds.length || explicitLensIds.length;

    if (hasExplicit) {
      return buildClassification({
        domainIds: explicitDomainIds,
        topicIds: explicitTopicIds,
        methodIds: unique([...legacy.methods.map((item) => item.id), ...explicitMethodIds]),
        lensIds: unique([...legacy.lenses.map((item) => item.id), ...explicitLensIds]),
        source: "record-fields",
        legacy: legacy.legacy
      });
    }

    const override = overrides.entries?.[slug];
    if (!override) return legacy;
    const legacyMethodIds = override.suppress_legacy_methods ? [] : legacy.methods.map((item) => item.id);
    const legacyLensIds = override.suppress_legacy_lenses ? [] : legacy.lenses.map((item) => item.id);
    return buildClassification({
      domainIds: unique(override.domain_ids ?? []),
      topicIds: unique(override.topic_ids ?? []),
      methodIds: unique([...legacyMethodIds, ...(override.method_ids ?? [])]),
      lensIds: unique([...legacyLensIds, ...(override.lens_ids ?? [])]),
      source: "reviewed-ontology-override",
      legacy: legacy.legacy
    });
  }

  return { ontology, overrides, domains, topics, methods, lenses, classifyLegacyZone, classifyRecord };
}
