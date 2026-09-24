import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchStorefront, isSafeMerchantId } from "../../../lib/storefront";
import { StorefrontCatalog } from "./StorefrontCatalog";

type StoreParams = { merchantId: string };

const loadStorefront = cache((merchantId: string) => fetchStorefront(merchantId));

async function readParams(
  params: StoreParams | Promise<StoreParams>
): Promise<StoreParams> {
  return params;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: StoreParams | Promise<StoreParams>;
}): Promise<Metadata> {
  const { merchantId } = await readParams(params);
  const store = isSafeMerchantId(merchantId)
    ? await loadStorefront(merchantId)
    : null;
  const title = store?.storeName ?? "Store";
  const description =
    store?.description || "Products from a verified Delego merchant.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

export default async function StorePage({
  params,
}: {
  params: StoreParams | Promise<StoreParams>;
}) {
  const { merchantId } = await readParams(params);
  if (!isSafeMerchantId(merchantId)) notFound();

  const store = await loadStorefront(merchantId);
  if (!store) notFound();

  return (
    <div className="settings-page">
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
      <StorefrontCatalog products={store.products} />
    </div>
  );
}
