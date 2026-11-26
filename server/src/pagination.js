// Pattern B: 5 rows by default with a 5/10/20 selector.
const { PAGE_SIZES } = require('./constants');

function parsePagination(query) {
  const requested = Number(query.pageSize);
  const pageSize = PAGE_SIZES.includes(requested) ? requested : PAGE_SIZES[0];
  const rawPage = Number(query.page);
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 1000000 ? rawPage : 1;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

const pageEnvelope = (items, total, page, pageSize) => ({
  items,
  total,
  page,
  pageSize,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

module.exports = { parsePagination, pageEnvelope };
