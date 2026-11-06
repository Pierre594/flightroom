// Keep geometry belonging to an animated part in that part's coordinate system.
export function modelPartRoot(object, model) {
  for (let parent = object; parent && parent !== model; parent = parent.parent) {
    if (parent.userData.propellerSpin) return parent;
  }
  return model;
}
