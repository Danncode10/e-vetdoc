import { unstable_rethrow } from "next/navigation";

/**
 * Server actions return their error message instead of throwing it: in production Next.js
 * replaces thrown messages with a generic "An error occurred in the Server Components render".
 */
export type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

export async function asActionResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { data: await run() };
  } catch (error) {
    unstable_rethrow(error); // let redirect()/notFound() through
    return { error: error instanceof Error && error.message ? error.message : "Something went wrong. Please try again." };
  }
}
