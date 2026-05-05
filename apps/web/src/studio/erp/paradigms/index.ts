import GoNoGo from "./Go_NoGo.json";
import P300 from "./P300.json";
import PAT_H from "./PAT_H.json";
import PAT_HLR from "./PAT_HLR.json";
import PAT_LR from "./PAT_LR.json";
import TOVA from "./TOVA.json";
import type { ParadigmDef } from "../types";

export const PARADIGMS = [P300, GoNoGo, TOVA, PAT_H, PAT_HLR, PAT_LR] as const satisfies readonly ParadigmDef[];
