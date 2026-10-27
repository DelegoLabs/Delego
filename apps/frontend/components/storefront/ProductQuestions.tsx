"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useWallet } from "../../hooks/useWallet";
import {
  fetchProductQuestions,
  submitProductAnswer,
  submitProductQuestion,
  type ProductAnswer,
  type ProductQuestion,
} from "../../lib/productQuestions";

const QUESTION_MAX_LENGTH = 500;
const ANSWER_MAX_LENGTH = 1000;

export interface ProductQuestionsProps {
  productId: string;
  productName: string;
  merchantAddress: string;
}

export function ProductQuestions({
  productId,
  productName,
  merchantAddress,
}: ProductQuestionsProps) {
  const askFormId = useId();
  const { address, status, connect } = useWallet();
  const [questions, setQuestions] = useState<ProductQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [askOpen, setAskOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isMerchant = Boolean(
    address &&
      merchantAddress &&
      address.toUpperCase() === merchantAddress.toUpperCase()
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchProductQuestions(productId)
      .then((items) => {
        if (!cancelled) setQuestions(items);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load product questions."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function handleQuestionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = questionText.trim();
    if (!address || !text || text.length > QUESTION_MAX_LENGTH) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const created = await submitProductQuestion(productId, {
        askerAddress: address,
        questionText: text,
      });
      setQuestions((current) => [...current, created]);
      setQuestionText("");
      setAskOpen(false);
      setNotice("Your question has been submitted.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not submit your question."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAnswerSubmit(
    event: FormEvent<HTMLFormElement>,
    question: ProductQuestion
  ) {
    event.preventDefault();
    const text = answerText[question.id]?.trim() ?? "";
    if (!address || !isMerchant || !text || text.length > ANSWER_MAX_LENGTH)
      return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const answer = await submitProductAnswer(productId, question.id, {
        authorAddress: address,
        answerText: text,
      });
      setQuestions((current) =>
        current.map((item) =>
          item.id === question.id
            ? { ...item, answers: [...item.answers, answer] }
            : item
        )
      );
      setAnswerText((current) => ({ ...current, [question.id]: "" }));
      setNotice("Your answer has been submitted.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not submit your answer."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function renderAnswer(answer: ProductAnswer, index: number) {
    return (
      <div
        key={`${answer.authorAddress}-${answer.answeredAt}-${index}`}
        style={{
          marginTop: "0.5rem",
          paddingLeft: "0.75rem",
          borderLeft: "2px solid #d1d5db",
        }}
      >
        <p style={{ margin: 0 }}>{answer.answerText}</p>
        <small style={{ color: "#6b7280" }}>
          {answer.authorAddress.slice(0, 6)}…{answer.authorAddress.slice(-4)}
          {answer.isMerchant && (
            <span
              aria-label="Merchant verified"
              style={{
                display: "inline-block",
                marginLeft: "0.5rem",
                padding: "0.125rem 0.375rem",
                borderRadius: "9999px",
                background: "#ecfdf5",
                color: "#047857",
                fontWeight: 700,
              }}
            >
              Merchant Verified
            </span>
          )}
          {answer.answeredAt &&
            ` · ${new Date(answer.answeredAt).toLocaleDateString()}`}
        </small>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={`product-questions-${productId}`}
      style={{
        display: "grid",
        gap: "0.75rem",
        borderTop: "1px solid #e5e7eb",
        paddingTop: "0.75rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <h3
          id={`product-questions-${productId}`}
          style={{ margin: 0, fontSize: "0.95rem" }}
        >
          Questions &amp; Answers
          {questions.length > 0 ? ` (${questions.length})` : ""}
        </h3>
        <button
          type="button"
          aria-expanded={askOpen}
          aria-controls={askFormId}
          onClick={() => {
            setAskOpen((open) => !open);
            setError(null);
          }}
          style={{
            border: 0,
            background: "none",
            color: "#2563eb",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Ask a question
        </button>
      </div>

      {askOpen && (
        <div
          id={askFormId}
          role="dialog"
          aria-label={`Ask about ${productName}`}
        >
          {address ? (
            <form
              onSubmit={handleQuestionSubmit}
              style={{ display: "grid", gap: "0.5rem" }}
            >
              <label htmlFor={`${askFormId}-question`}>Your question</label>
              <textarea
                id={`${askFormId}-question`}
                value={questionText}
                onChange={(event) => setQuestionText(event.target.value)}
                maxLength={QUESTION_MAX_LENGTH}
                required
                rows={3}
              />
              <small>
                {questionText.length}/{QUESTION_MAX_LENGTH}
              </small>
              <button
                type="submit"
                disabled={submitting || !questionText.trim()}
              >
                {submitting ? "Submitting…" : "Submit question"}
              </button>
            </form>
          ) : (
            <div>
              <p>Connect your Stellar wallet to ask a question.</p>
              <button
                type="button"
                onClick={() => void connect()}
                disabled={status === "connecting"}
              >
                {status === "connecting" ? "Connecting…" : "Connect wallet"}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" style={{ margin: 0 }}>
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading questions…</p>
      ) : questions.length === 0 ? (
        <p>No questions yet. Be the first to ask about this product.</p>
      ) : (
        <ul
          style={{
            display: "grid",
            gap: "0.75rem",
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {questions.map((question) => (
            <li
              key={question.id}
              style={{
                padding: "0.75rem",
                borderRadius: "0.5rem",
                background: "#f9fafb",
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>
                {question.questionText}
              </p>
              <small style={{ color: "#6b7280" }}>
                Asked by {question.askerAddress.slice(0, 6)}…
                {question.askerAddress.slice(-4)}
                {question.createdAt &&
                  ` · ${new Date(question.createdAt).toLocaleDateString()}`}
              </small>
              {question.answers.map(renderAnswer)}
              {isMerchant && (
                <form
                  onSubmit={(event) => void handleAnswerSubmit(event, question)}
                  style={{
                    display: "grid",
                    gap: "0.5rem",
                    marginTop: "0.75rem",
                  }}
                >
                  <label htmlFor={`${askFormId}-answer-${question.id}`}>
                    Reply as merchant
                  </label>
                  <textarea
                    id={`${askFormId}-answer-${question.id}`}
                    value={answerText[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswerText((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                    maxLength={ANSWER_MAX_LENGTH}
                    required
                    rows={2}
                  />
                  <button
                    type="submit"
                    disabled={submitting || !answerText[question.id]?.trim()}
                  >
                    {submitting ? "Submitting…" : "Submit answer"}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
