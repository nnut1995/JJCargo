// Status steps of a shipment round (container / truck), in order. Requested at the 2026-11 demo.
export const SHIPMENT_STATUSES: { key: string; th: string; zh: string; en: string; tone: 'neutral' | 'info' | 'warn' | 'good' | 'bad' }[] = [
  { key: 'loaded', th: 'ขึ้นตู้แล้ว', zh: '已装柜', en: 'Loaded on container', tone: 'info' },
  { key: 'in_transit', th: 'อยู่ระหว่างทางขนส่ง', zh: '运输中', en: 'In transit', tone: 'info' },
  { key: 'inspect_cn', th: 'ตู้โดนตรวจที่จีน', zh: '中国查柜', en: 'Inspected in China', tone: 'bad' },
  { key: 'inspect_th', th: 'ตู้โดนตรวจที่ไทย', zh: '泰国查柜', en: 'Inspected in Thailand', tone: 'bad' },
  { key: 'customs_done', th: 'ทำพิธีศุลกากรแล้ว', zh: '已清关', en: 'Customs cleared', tone: 'warn' },
  { key: 'arrived_th', th: 'ถึงคลังสินค้าที่ไทยแล้ว', zh: '已到泰国仓库', en: 'At Thai warehouse', tone: 'good' },
  { key: 'delivered', th: 'นำจัดส่งแล้ว', zh: '已派送', en: 'Out for delivery', tone: 'good' },
];
export const SHIPMENT_STATUS_KEYS = SHIPMENT_STATUSES.map((s) => s.key);
