import { env } from "./env";
import { isDemoMode } from "./demoMode";
import { DemoModeWriteBlockedError } from "./api";

/**
 * Product Q&A API contract used by the storefront:
 * GET/POST /api/v1/products/:productId/questions and
 * POST /api/v1/products/:productId/questions/:questionId/answers.
 * The API must authenticate writers and derive `isMerchant` itself.
 */
export interface ProductAnswer {
  authorAddress: string;
  isMerchant: boolean;
  answerText: string;
  answeredAt: string;
}

export interface ProductQuestion {
  id: string;
  productId: string;
  askerAddress: string;
  questionText: string;
  answers: ProductAnswer[];
  createdAt: string;
}

function questionsUrl(productId: string): string {
  return `${env.NEXT_PUBLIC_API_URL}/api/v1/products/${encodeURIComponent(productId)}/questions`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseAnswer(value: unknown): ProductAnswer | null {
  const answer = record(value);
  if (
    !answer ||
    typeof answer.authorAddress !== "string" ||
    typeof answer.answerText !== "string"
  ) {
    return null;
  }
  return {
    authorAddress: answer.authorAddress,
    // Only the API may attest that a reply came from the product's merchant.
    isMerchant: answer.isMerchant === true,
    answerText: answer.answerText,
    answeredAt: typeof answer.answeredAt === "string" ? answer.answeredAt : "",
  };
}

function parseQuestion(value: unknown): ProductQuestion | null {
  const question = record(value);
  if (
    !question ||
    typeof question.id !== "string" ||
    typeof question.productId !== "string" ||
    typeof question.askerAddress !== "string" ||
    typeof question.questionText !== "string"
  ) {
    return null;
  }
  return {
    id: question.id,
    productId: question.productId,
    askerAddress: question.askerAddress,
    questionText: question.questionText,
    answers: Array.isArray(question.answers)
      ? question.answers
          .map(parseAnswer)
          .filter((answer): answer is ProductAnswer => answer !== null)
      : [],
    createdAt: typeof question.createdAt === "string" ? question.createdAt : "",
  };
}

async function responseError(
  response: Response,
  fallback: string
): Promise<Error> {
  const body = record(await response.json().catch(() => null));
  const error = record(body?.error);
  const message = error?.message ?? body?.message;
  return new Error(
    typeof message === "string" ? message : `${fallback} (${response.status})`
  );
}

async function writeJson<T>(
  url: string,
  payload: unknown,
  fallback: string
): Promise<T> {
  if (isDemoMode()) throw new DemoModeWriteBlockedError("POST", url);
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await responseError(response, fallback);
  const body = record(await response.json().catch(() => null));
  return ((record(body?.data) ?? body) as T) ?? ({} as T);
}

/** Load public questions for one product from the storefront API. */
export async function fetchProductQuestions(
  productId: string
): Promise<ProductQuestion[]> {
  const response = await fetch(questionsUrl(productId), {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok)
    throw await responseError(response, "Could not load product questions");
  const body = record(await response.json().catch(() => null));
  const payload = body?.data ?? body;
  const data = record(payload);
  const values = Array.isArray(payload)
    ? payload
    : Array.isArray(data?.questions)
      ? data.questions
      : [];
  return values
    .map(parseQuestion)
    .filter((question): question is ProductQuestion => question !== null);
}

/** Submit a question using the connected customer's public wallet address. */
export async function submitProductQuestion(
  productId: string,
  payload: { askerAddress: string; questionText: string }
): Promise<ProductQuestion> {
  const value = await writeJson<unknown>(
    questionsUrl(productId),
    payload,
    "Could not submit your question"
  );
  const question = parseQuestion(value);
  if (!question) throw new Error("The server returned an invalid question.");
  return question;
}

/** Submit a merchant reply; the API remains responsible for verifying its author. */
export async function submitProductAnswer(
  productId: string,
  questionId: string,
  payload: { authorAddress: string; answerText: string }
): Promise<ProductAnswer> {
  const value = await writeJson<unknown>(
    `${questionsUrl(productId)}/${encodeURIComponent(questionId)}/answers`,
    payload,
    "Could not submit your answer"
  );
  const answer = parseAnswer(value);
  if (!answer) throw new Error("The server returned an invalid answer.");
  return answer;
}
