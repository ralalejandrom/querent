/**
 * Fictional example content: the seeded people, posts and reviews that show how Lyncei works.
 * Their accounts use @example.com addresses, nobody can sign in to them, and every post they
 * wrote is labeled as a fictional example. Set SHOW_EXAMPLES=0 to hide them once real posts fill the feed.
 */
export const isExampleEmail = (email: string) => email.toLowerCase().endsWith("@example.com");
export const showExamples = () => process.env.SHOW_EXAMPLES !== "0";
