// Pure device-request selector. Diagnostic previews are not regular reminders,
// but must be cancellable when the user disables reminders or changes account.
export type PendingNotificationLike = {
  identifier: string;
  content: { data?: Record<string, unknown> };
};

export function pendingDeliveryTestIds(
  requests: PendingNotificationLike[],
  ownerKey: string,
): string[] {
  return requests
    .filter((request) => {
      const data = request.content.data;
      return Boolean(
        data?.myelin === true &&
        data.preview === true &&
        data.deliveryTest === true &&
        data.ownerKey === ownerKey,
      );
    })
    .map((request) => request.identifier);
}
