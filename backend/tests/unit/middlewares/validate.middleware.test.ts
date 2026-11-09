import { Request, Response } from "express";

import { validate } from "../../../src/middlewares/validate.middleware";
import { createCandidateSchema } from "../../../src/validators/candidate.schema";

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("validate", () => {
  it("renvoie 400 avec le détail des champs invalides", () => {
    const res = mockResponse();
    const next = jest.fn();

    validate(createCandidateSchema)({ body: { fullName: "A", email: "x" } } as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error.details.map((d: { field: string }) => d.field)).toEqual(
      expect.arrayContaining(["fullName", "email"]),
    );
  });

  it("remplace le body par la donnée validée et appelle next", () => {
    const req = { body: { fullName: "  Jean Dupont ", email: "JEAN@MAIL.COM" } } as Request;
    const next = jest.fn();

    validate(createCandidateSchema)(req, mockResponse(), next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ fullName: "Jean Dupont", email: "jean@mail.com" });
  });
});
