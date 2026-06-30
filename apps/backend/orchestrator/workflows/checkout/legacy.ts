/** Legacy checkout workflow stub — preserved for backward compatibility */
export async function checkoutWorkflow(_input: { orderId: string }): Promise<{ status: "pending" }> {
  return { status: "pending" };
}
