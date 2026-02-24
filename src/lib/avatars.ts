export const AVATARS = [
  '😀','😎','🤩','🥳','😺','🐶','🐸','🦊',
  '🦁','🐯','🐻','🐼','🐨','🐙','🦄','🐲',
  '🌟','⚡','🔥','🎯','🎮','🚀','💎','🍀',
] as const;

export type Avatar = typeof AVATARS[number];
