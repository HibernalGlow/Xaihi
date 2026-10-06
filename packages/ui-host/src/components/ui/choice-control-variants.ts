export const CHOICE_CONTROL_STYLES = ["segmented", "pills", "tabs", "tiles", "none"] as const

export type ChoiceControlStyle = (typeof CHOICE_CONTROL_STYLES)[number]

export const FIELD_TITLE_STYLES = ["stacked", "legend", "inline", "hidden", "none"] as const

export type FieldTitleStyle = (typeof FIELD_TITLE_STYLES)[number]

/** @deprecated Use FIELD_TITLE_STYLES. Kept for registry consumers during migration. */
export const CHOICE_CONTROL_LABEL_STYLES = FIELD_TITLE_STYLES
/** @deprecated Use FieldTitleStyle. */
export type ChoiceControlLabelStyle = FieldTitleStyle
