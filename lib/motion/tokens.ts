/** 设计系统共用参数；角色状态与造型由看山引擎独立管理。 */
export const CARD_SPRING = { type: 'spring', stiffness: 260, damping: 26 } as const;
export const GAP_SPRING = { type: 'spring', stiffness: 180, damping: 18 } as const;
export const BAR_SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;
export const MAGNET_SPRING = { stiffness: 150, damping: 15 } as const;
export const STAGGER = 0.06;
export const GAP_PAUSE = 0.4;
