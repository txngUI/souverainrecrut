import { Request, Response } from "express";
import jwt from "jsonwebtoken";

import { authMiddleware } from "../../../src/middlewares/auth.middleware";
import { AppError } from "../../../src/errors/app.error";

const run = (authorization?: string) => {
  const req = { headers: { authorization } } as Request;
  const next = jest.fn();
  authMiddleware(req, {} as Response, next);
  return { req, error: next.mock.calls[0][0] as AppError | undefined };
};

describe("authMiddleware", () => {
  it("refuse une requête sans header Authorization (401)", () => {
    const { error } = run();
    expect(error).toBeInstanceOf(AppError);
    expect(error?.statusCode).toBe(401);
    expect(error?.message).toBe("Authentification requise.");
  });

  it("refuse un header qui n'est pas de type Bearer", () => {
    expect(run("Basic abc").error?.message).toBe("Token invalide.");
  });

  it("refuse un header Bearer sans token", () => {
    expect(run("Bearer").error?.message).toBe("Token invalide.");
  });

  it("refuse un token signé avec un autre secret", () => {
    const token = jwt.sign({ id: "1", role: "ADMIN" }, "mauvais-secret");
    expect(run(`Bearer ${token}`).error?.message).toBe("Token invalide ou expiré.");
  });

  it("refuse un token expiré", () => {
    const token = jwt.sign({ id: "1", role: "ADMIN" }, "test-secret", { expiresIn: -10 });
    expect(run(`Bearer ${token}`).error?.statusCode).toBe(401);
  });

  it("accepte un token valide et renseigne req.user", () => {
    const token = jwt.sign({ id: "42", role: "RECRUITER" }, "test-secret");
    const { req, error } = run(`Bearer ${token}`);
    expect(error).toBeUndefined();
    expect(req.user).toEqual({ id: "42", role: "RECRUITER" });
  });
});
