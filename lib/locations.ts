export const HEAD_OFFICE_SHOP_NAME = 'Head Office'

export const isHeadOfficeName = (shopName: string) =>
  shopName.trim().toLowerCase() === HEAD_OFFICE_SHOP_NAME.toLowerCase()

export const isFixedLocation = (location: { shop_name: string; is_fixed?: boolean }) =>
  location.is_fixed === true || isHeadOfficeName(location.shop_name)
