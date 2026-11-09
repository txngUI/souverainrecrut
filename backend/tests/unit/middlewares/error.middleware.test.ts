import { NextFunction, Request, Response } from "express";

import { errorMiddleware } from "../../../src/middlewares/error.middleware";
import { AppError } from "../../../src/errors/app.error";

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("errorMiddleware", () => {
  it("renvoie le code et le message d'une AppError", () => {
    const res = mockResponse();
    errorMiddleware(
      new AppError("Introuvable", 404),
      {} as Request,
      res,
      jest.fn() as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: 404, message: "Introuvable" },
    });
  });

  it("masque les erreurs inattendues derrière une 500", () => {
    const res = mockResponse();
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    errorMiddleware(new Error("secret interne"), {} as Request, res, jest.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: 500, message: "Erreur interne du serveur." },
    });
  });
});

describe("AppError", () => {
  it("vaut 500 par défaut et est marquée opérationnelle", () => {
    const error = new AppError("oups");
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
  });
});
