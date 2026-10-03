/**
 * Build-time helpers for the per-event intake form on /hi/{tag}/.
 *
 * The form posts to a separate intake service that owns the real checks (the signed
 * token, hCaptcha, which websites may submit). Nothing here verifies anything: the site
 * only needs to know, at build time, which fields a link asks for and whether it has
 * already expired, so it doesn't render a form that is certain to fail. It never holds
 * the signing secret, and a token read here is not trusted by anything.
 *
 * The field table, the length caps and the error codes in `copy.hi.intake.errors` mirror
 * the intake service's own (its token claim `f`, `src/limits.ts`, `src/respond.ts`). If
 * either side changes one, change the other in step.
 */

export type FieldKey =
  | "email"
  | "phone"
  | "organization"
  | "role"
  | "website"
  | "how_we_met"
  | "message";

export interface FieldDef {
  key: FieldKey;
  /** The single-letter code the token's `f` claim uses for this field. */
  code: string;
  label: string;
  control: "input" | "textarea";
  type?: "text" | "email" | "tel";
  maxlength: number;
  autocomplete?: string;
  inputmode?: "email" | "tel" | "url";
  rows?: number;
}

/** The optional fields, in the order the token's `f` claim lists them. */
export const OPTIONAL_FIELDS: FieldDef[] = [
  { key: "email", code: "e", label: "Email", control: "input", type: "email", maxlength: 300, autocomplete: "email", inputmode: "email" },
  { key: "phone", code: "p", label: "Phone", control: "input", type: "tel", maxlength: 100, autocomplete: "tel", inputmode: "tel" },
  { key: "organization", code: "o", label: "Organization", control: "input", type: "text", maxlength: 300, autocomplete: "organization" },
  { key: "role", code: "r", label: "Your role", control: "input", type: "text", maxlength: 300, autocomplete: "organization-title" },
  { key: "website", code: "w", label: "LinkedIn or website", control: "input", type: "text", maxlength: 500, autocomplete: "url", inputmode: "url" },
  { key: "how_we_met", code: "h", label: "How we met", control: "textarea", maxlength: 2000, rows: 3 },
  { key: "message", code: "m", label: "Anything you'd like to add", control: "textarea", maxlength: 4000, rows: 4 },
];

/** The name is always asked for, and is the only required field. */
export const NAME_MAX_LENGTH = 300;

interface TokenClaims {
  /** Expiry, unix seconds; absent when the link never expires. */
  x?: number;
  /** Optional fields asked for, as letter codes; absent means all of them. */
  f?: string;
}

const FIELD_CODES = /^[ephorwm]{0,7}$/;

function decodeBase64Url(text: string): string {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Read a share token's claims without verifying it, or null if it is not shaped like one. */
export function readTokenClaims(token: string): TokenClaims | null {
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return null;
  try {
    const claims = JSON.parse(decodeBase64Url(body)) as Record<string, unknown>;
    if (typeof claims !== "object" || claims === null) return null;
    if (claims.x !== undefined && typeof claims.x !== "number") return null;
    if (claims.f !== undefined && (typeof claims.f !== "string" || !FIELD_CODES.test(claims.f))) return null;
    return { x: claims.x as number | undefined, f: claims.f as string | undefined };
  } catch {
    return null;
  }
}

/** The optional fields a token asks for. No `f` claim means every field. */
export function fieldsFor(claims: TokenClaims): FieldDef[] {
  if (claims.f === undefined) return OPTIONAL_FIELDS;
  return OPTIONAL_FIELDS.filter((field) => claims.f!.includes(field.code));
}

export type FormState =
  | { kind: "form"; fields: FieldDef[] }
  | { kind: "none"; reason: "no-token" | "not-configured" | "malformed" | "expired" };

export interface IntakeConfig {
  submitUrl: string;
  sitekey: string;
}

let warned = false;

/**
 * Where the form posts and the hCaptcha sitekey, from the PUBLIC_INTAKE_SUBMIT_URL and
 * PUBLIC_HCAPTCHA_SITEKEY build variables. Null (with one warning) when either is missing
 * or the URL is not https (http://localhost is allowed for local development), so a build
 * without them still produces the pages, just without forms.
 */
export function intakeConfig(
  env: { PUBLIC_INTAKE_SUBMIT_URL?: string; PUBLIC_HCAPTCHA_SITEKEY?: string } = import.meta.env
): IntakeConfig | null {
  const submitUrl = (env.PUBLIC_INTAKE_SUBMIT_URL ?? "").trim();
  const sitekey = (env.PUBLIC_HCAPTCHA_SITEKEY ?? "").trim();
  let valid = false;
  try {
    const url = new URL(submitUrl);
    valid = url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost");
  } catch {
    valid = false;
  }
  if (valid && sitekey) return { submitUrl, sitekey };
  if (!warned) {
    warned = true;
    console.warn(
      "[intake] PUBLIC_INTAKE_SUBMIT_URL (https) and PUBLIC_HCAPTCHA_SITEKEY are both needed " +
        "to render the event forms; building the /hi/{tag}/ pages without them."
    );
  }
  return null;
}

/**
 * Whether an event's page gets a form, and which fields. An event with no token, a token
 * that is not shaped like one, or one that has already expired gets its text and no form.
 */
export function formStateFor(
  token: string | null,
  config: IntakeConfig | null,
  nowMs: number = Date.now()
): FormState {
  if (!token) return { kind: "none", reason: "no-token" };
  if (!config) return { kind: "none", reason: "not-configured" };
  const claims = readTokenClaims(token);
  if (!claims) {
    console.warn("[intake] An event's intake token is not shaped like a share token; no form.");
    return { kind: "none", reason: "malformed" };
  }
  if (claims.x !== undefined && claims.x * 1000 <= nowMs) {
    return { kind: "none", reason: "expired" };
  }
  return { kind: "form", fields: fieldsFor(claims) };
}
