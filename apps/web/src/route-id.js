const ROUTE_ALIASES = {
  'brain-twin': 'deeptwin',
};

export function normalizeRouteId(id) {
  if (typeof id !== 'string') return id;
  return ROUTE_ALIASES[id] || id;
}
