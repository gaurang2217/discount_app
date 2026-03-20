import { supabase } from './supabase';

let mappingCache: Map<string, string> | null = null;
let cacheTs = 0;

export async function loadMappings(): Promise<Map<string, string>> {
  const now = Date.now();
  if (mappingCache && now - cacheTs <= 60_000) {
    return mappingCache;
  }
  const { data, error } = await supabase
    .from('manufacturer_mappings')
    .select('from_name, to_name');
  if (error) throw new Error(`Failed to load mappings: ${error.message}`);
  mappingCache = new Map((data ?? []).map((r: { from_name: string; to_name: string }) => [r.from_name, r.to_name]));
  cacheTs = now;
  return mappingCache;
}

export function applyManufacturerMappingSync(map: Map<string, string>, name: string): string {
  return map.get(name) ?? name;
}

export function invalidateMappingCache() {
  mappingCache = null;
}
