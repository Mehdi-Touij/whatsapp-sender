// Spintax parser — converts {Hi|Hello|Hey} to a random choice
// Used to make every message slightly different (anti-ban Layer 4)

export function parseSpintax(text: string): string {
  const regex = /\{([^}]+)\}/g;
  return text.replace(regex, (_, options: string) => {
    const choices = options.split("|");
    const idx = Math.floor(Math.random() * choices.length);
    return choices[idx];
  });
}

// Personalize — replace {name} and {phone} placeholders
export function personalize(text: string, name: string, phone: string): string {
  return text
    .replace(/{name}/g, name || "")
    .replace(/{phone}/g, phone);
}

// Build final message: spintax + personalize + reply prompt
export function buildMessage(template: string, name: string, phone: string): string {
  const personalized = personalize(template, name, phone);
  const spintaxed = parseSpintax(personalized);
  return `${spintaxed}\n\nReply 1 to confirm you received this.`;
}