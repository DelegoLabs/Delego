import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchStorefront, isSafeMerchantId } from "../../../lib/storefront";
import { StorefrontAnnouncementBar } from "../../../components/storefront/StorefrontAnnouncementBar";
import { StorefrontCatalog } from "./StorefrontCatalog";

const loadStorefront = cache((merchantId: string) => fetchStorefront(merchantId));

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ merchantId: string }>;
}): Promise<Metadata> {
  try {
    const { merchantId } = await params;
    const store = isSafeMerchantId(merchantId)
      ? await loadStorefront(merchantId)
      : null;
    const title = store?.storeName ?? "Merchant Store | Delego";
    const description =
      store?.description || "Products from a verified Delego merchant.";
    return {
      title,
      description,
      openGraph: { title, description, type: "website" },
    };
  } catch (error) {
    // Fallback metadata on API errors or timeouts to prevent 500 errors
    const fallbackTitle = "Merchant Store | Delego";
    const fallbackDescription = "Products from a verified Delego merchant.";
    return {
      title: fallbackTitle,
      description: fallbackDescription,
      openGraph: { 
        title: fallbackTitle, 
        description: fallbackDescription, 
        type: "website" 
      },
    };
  }
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ merchantId: string }>;
}) {
  const { merchantId } = await params;
  if (!isSafeMerchantId(merchantId)) notFound();

  const store = await loadStorefront(merchantId);
  if (!store) notFound();

  return (
    <div className="settings-page">
      {store.announcement && (
        <StorefrontAnnouncementBar
          merchantId={store.merchantId}
          announcement={store.announcement}
        />
      )}
      <header className="header">
        <h1>{store.storeName}</h1>
        {store.description && <p>{store.description}</p>}
      </header>
      <dl className="wallet-detail-list">
        <div className="wallet-detail-row">
          <dt>Stellar address</dt>
          <dd>
            <code>{store.stellarAddress || "Not published"}</code>
          </dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Reputation</dt>
          <dd>{store.reputationScore}</dd>
        </div>
      </dl>
      <StorefrontCatalog
        products={store.products}
        merchantId={store.merchantId}
        merchantName={store.storeName}
        payoutAddress={store.stellarAddress}
      />
    </div>
  );
}
