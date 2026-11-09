import { Role } from "@prisma/client";
import { Request, Response } from "express";

import { authorize } from "../../../src/middlewares/authorize.middleware";

const run = (user: Request["user"], ...roles: Role[]) => {
  const next = jest.fn();
  authorize(...roles)({ user } as Request, {} as Response, next);
  return next.mock.calls[0][0];
};

describe("authorize", () => {
  it("renvoie 401 si l'utilisateur n'est pas authentifié", () => {
    expect(run(undefined, Role.ADMIN).statusCode).toBe(401);
  });

  it("renvoie 403 si le rôle n'est pas autorisé", () => {
    const error = run({ id: "1", role: Role.RECRUITER }, Role.ADMIN);
    expect(error.statusCode).toBe(403);
  });

  it("laisse passer un rôle autorisé", () => {
    expect(run({ id: "1", role: Role.ADMIN }, Role.ADMIN, Role.RECRUITER)).toBeUndefined();
  });
});
