import { buildPaginationMeta, getPagination } from "../../../src/utils/pagination";

describe("getPagination", () => {
  it("retourne page 1 / limit 10 par défaut", () => {
    expect(getPagination()).toEqual({ page: 1, limit: 10, skip: 0 });
  });

  it("calcule le skip à partir de la page et de la limite", () => {
    expect(getPagination("3", "20")).toEqual({ page: 3, limit: 20, skip: 40 });
  });

  it("plafonne la limite à 100", () => {
    expect(getPagination("1", "500").limit).toBe(100);
  });

  it("ramène une page ou une limite négative à 1", () => {
    expect(getPagination("-4", "-2")).toEqual({ page: 1, limit: 1, skip: 0 });
  });
});

describe("buildPaginationMeta", () => {
  it("calcule le nombre total de pages", () => {
    expect(buildPaginationMeta(1, 10, 25)).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
  });

  it("retourne 0 page quand il n'y a aucun élément", () => {
    expect(buildPaginationMeta(1, 10, 0).totalPages).toBe(0);
  });
});
