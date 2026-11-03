// Server-owned copy of the existing Housekeeping room defaults.
// Keep in sync with buildDefaultRooms() and buildChecklist() in src/App.tsx.
// Do not accept default room rows from callers.
const FLOORS = ["2F", "3F", "5F", "6F", "7F", "RF"];
const SUFFIXES = ["1", "2", "3", "5", "6", "7", "8"];

const ITEMS = [
  ["flooring", "掃地・拖地", "地板需清潔乾淨，無明顯灰塵、毛髮、污漬。", true,
    [["sweep", "掃地"], ["mop", "拖地"]]],
  ["surface_cleaning", "擦桌椅櫃子洗手台", "桌面、椅子、櫃體、洗手台表面需擦拭乾淨。", false,
    [["table", "擦桌子"], ["chair", "擦椅子"], ["cabinet", "擦櫃子"], ["sink", "擦洗手台"]]],
  ["bed_setup", "整理床鋪", "鋪設床墊、床罩、棉被、枕頭與最後擺設完整。", false,
    [["mattress", "鋪設床墊"], ["bed_cover", "鋪設床罩"], ["quilt", "棉被＋被套"],
     ["pillow", "枕頭套"], ["bed_final", "最後擺設完整"]]],
  ["bathroom", "廁所清潔", "擺放踏墊、沐浴乳／肥皂、衛生紙、吹風機。", true,
    [["bathroom_clean", "廁所清潔完成"], ["mat", "擺放踏墊"],
     ["soap", "擺放沐浴乳／肥皂"], ["toilet_paper", "擺放衛生紙"], ["dryer", "擺放吹風機"]]],
];

export function buildChecklist() {
  return ITEMS.map(([id, label, description, requiredPhoto, subItems]) => ({
    id, label, description, requiredPhoto, done: false, photo: false,
    subItems: subItems.map(([id, label]) => ({ id, label, done: false })),
  }));
}

export function buildDefaultEventRooms() {
  return ["A", "B"].flatMap(building => FLOORS.flatMap(floor => {
    const prefix = floor === "RF" ? "R" : floor.replace("F", "0");
    return SUFFIXES.map(suffix => ({
      building, floor, room_no: `${prefix}${suffix}`, checklist: buildChecklist(),
    }));
  }));
}
