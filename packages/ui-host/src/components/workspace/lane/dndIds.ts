export interface LaneDragData {
  type: "lane"
  laneId: string
}

export interface LaneDropData {
  type: "lane-drop"
  laneId: string
}

export interface CardDragData {
  type: "card"
  cardId: string
  laneId: string
}

export type LaneDndData = LaneDragData | LaneDropData | CardDragData

export function laneDndId(laneId: string): string {
  return `lane:${laneId}`
}

export function laneDropDndId(laneId: string): string {
  return `lane-drop:${laneId}`
}

export function cardDndId(cardId: string): string {
  return `card:${cardId}`
}

export function isLaneDragData(value: unknown): value is LaneDragData {
  return isData(value) && value.type === "lane"
}

export function isLaneDropData(value: unknown): value is LaneDropData {
  return isData(value) && value.type === "lane-drop"
}

export function isCardDragData(value: unknown): value is CardDragData {
  return isData(value) && value.type === "card"
}

function isData(value: unknown): value is LaneDndData {
  return typeof value === "object" && value !== null && "type" in value
}
