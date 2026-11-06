export function modelIdsFromAssets(modelAssets) {
  if (!Array.isArray(modelAssets) || modelAssets.some(a => !a || typeof a.id !== 'string' || !a.id || a.id === 'default' || typeof a.data !== 'string' || !a.data.startsWith('data:model/gltf-binary;base64,')) || new Set(modelAssets.map(a => a.id)).size !== modelAssets.length) throw new Error('Invalid model assets.');
  return new Set(['default', ...modelAssets.map(a => a.id)]);
}

export function readModelAssignment(flight, availableModels) {
  const modelId = flight.modelId ?? 'default', modelScale = flight.modelScale ?? 1;
  if (!availableModels.has(modelId) || !Number.isFinite(modelScale) || modelScale <= 0) throw new Error('Invalid drone model assignment or scale.');
  return { modelId, modelScale };
}
