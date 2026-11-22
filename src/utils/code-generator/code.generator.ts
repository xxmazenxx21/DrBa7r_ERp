export function generateCode(value: string): string {
  const random = Math.floor(100000 + Math.random() * 900000);

  return `${value}-${random}`;
}
