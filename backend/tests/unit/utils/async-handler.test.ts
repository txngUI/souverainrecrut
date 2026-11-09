import { Request, Response } from "express";

import { asyncHandler } from "../../../src/utils/async-handler";

const req = {} as Request;
const res = {} as Response;

describe("asyncHandler", () => {
  it("exécute la fonction sans appeler next quand tout va bien", async () => {
    const next = jest.fn();
    const handler = asyncHandler(async () => "ok");

    handler(req, res, next);
    await new Promise(setImmediate);

    expect(next).not.toHaveBeenCalled();
  });

  it("transmet l'erreur à next quand la promesse est rejetée", async () => {
    const next = jest.fn();
    const error = new Error("boom");
    const handler = asyncHandler(async () => {
      throw error;
    });

    handler(req, res, next);
    await new Promise(setImmediate);

    expect(next).toHaveBeenCalledWith(error);
  });
});
