import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductQuestions } from "./ProductQuestions";
import {
  fetchProductQuestions,
  submitProductAnswer,
  submitProductQuestion,
  type ProductQuestion,
} from "../../lib/productQuestions";

const { wallet } = vi.hoisted(() => ({
  wallet: {
    address: null as string | null,
    status: "disconnected",
    connect: vi.fn(),
  },
}));

vi.mock("../../hooks/useWallet", () => ({ useWallet: () => wallet }));
vi.mock("../../lib/productQuestions", () => ({
  fetchProductQuestions: vi.fn(),
  submitProductQuestion: vi.fn(),
  submitProductAnswer: vi.fn(),
}));

const question: ProductQuestion = {
  id: "question-1",
  productId: "product-1",
  askerAddress: "GBUYER",
  questionText: "Is this available in blue?",
  answers: [],
  createdAt: "2026-10-20T12:00:00.000Z",
};

describe("ProductQuestions", () => {
  beforeEach(() => {
    wallet.address = null;
    wallet.status = "disconnected";
    wallet.connect.mockReset();
    vi.mocked(fetchProductQuestions).mockResolvedValue([]);
    vi.mocked(submitProductQuestion).mockReset();
    vi.mocked(submitProductAnswer).mockReset();
  });

  it("shows questions and marks only server-verified merchant replies", async () => {
    vi.mocked(fetchProductQuestions).mockResolvedValue([
      {
        ...question,
        answers: [
          {
            authorAddress: "GMERCHANT",
            isMerchant: true,
            answerText: "Yes, blue is in stock.",
            answeredAt: "2026-10-21T12:00:00.000Z",
          },
          {
            authorAddress: "GBUYER2",
            isMerchant: false,
            answerText: "I bought the red one.",
            answeredAt: "2026-10-22T12:00:00.000Z",
          },
        ],
      },
    ]);

    render(
      <ProductQuestions
        productId="product-1"
        productName="Blue Mug"
        merchantAddress="GMERCHANT"
      />
    );

    expect(
      await screen.findByText("Is this available in blue?")
    ).toBeInTheDocument();
    expect(screen.getByText("Yes, blue is in stock.")).toBeInTheDocument();
    expect(screen.getByLabelText("Merchant verified")).toHaveTextContent(
      "Merchant Verified"
    );
    expect(screen.getByText("I bought the red one.")).toBeInTheDocument();
    expect(screen.getAllByText("Merchant Verified")).toHaveLength(1);
  });

  it("submits a customer's question with the connected wallet address", async () => {
    wallet.address = "GBUYER";
    wallet.status = "connected";
    vi.mocked(submitProductQuestion).mockResolvedValue(question);

    render(
      <ProductQuestions
        productId="product-1"
        productName="Blue Mug"
        merchantAddress="GMERCHANT"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));
    fireEvent.change(screen.getByLabelText("Your question"), {
      target: { value: "Is this available in blue?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit question" }));

    await waitFor(() =>
      expect(submitProductQuestion).toHaveBeenCalledWith("product-1", {
        askerAddress: "GBUYER",
        questionText: "Is this available in blue?",
      })
    );
    expect(
      await screen.findByText("Your question has been submitted.")
    ).toBeInTheDocument();
  });

  it("lets only the connected storefront merchant submit a reply", async () => {
    wallet.address = "GMERCHANT";
    wallet.status = "connected";
    vi.mocked(fetchProductQuestions).mockResolvedValue([question]);
    vi.mocked(submitProductAnswer).mockResolvedValue({
      authorAddress: "GMERCHANT",
      isMerchant: true,
      answerText: "Yes.",
      answeredAt: "2026-10-22T12:00:00.000Z",
    });

    render(
      <ProductQuestions
        productId="product-1"
        productName="Blue Mug"
        merchantAddress="GMERCHANT"
      />
    );
    fireEvent.change(await screen.findByLabelText("Reply as merchant"), {
      target: { value: "Yes." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    await waitFor(() =>
      expect(submitProductAnswer).toHaveBeenCalledWith(
        "product-1",
        "question-1",
        {
          authorAddress: "GMERCHANT",
          answerText: "Yes.",
        }
      )
    );
    expect(await screen.findByText("Yes.")).toBeInTheDocument();
  });

  it("asks visitors to connect before posting a question", async () => {
    render(
      <ProductQuestions
        productId="product-1"
        productName="Blue Mug"
        merchantAddress="GMERCHANT"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(wallet.connect).toHaveBeenCalledTimes(1);
  });
});
