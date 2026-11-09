jest.mock("../../src/config/prisma", () => require("../helpers/prisma-mock"));

import request from "supertest";

import app from "../../src/app";
import { prismaMock } from "../helpers/prisma-mock";

beforeEach(() => jest.resetAllMocks());

describe("Routes publiques", () => {
  it("GET / renvoie le message d'accueil", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, api: "/v1" });
  });

  it("ne révèle pas le framework via l'en-tête X-Powered-By", async () => {
    const res = await request(app).get("/");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("GET /api-docs/ sert la documentation Swagger", async () => {
    const res = await request(app).get("/api-docs/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger");
  });

  it("GET /v1/info renvoie les informations de l'API", async () => {
    const res = await request(app).get("/v1/info");
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("SouverainRecrut API");
  });

  it("GET /v1/health renvoie UP", async () => {
    const res = await request(app).get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("UP");
  });

  it("GET /v1/ready renvoie 200 quand la base répond", async () => {
    prismaMock.$queryRaw.mockResolvedValue([1]);
    const res = await request(app).get("/v1/ready");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /v1/ready renvoie 503 quand la base est indisponible", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("down"));
    const res = await request(app).get("/v1/ready");
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it("une route inconnue renvoie 404", async () => {
    const res = await request(app).get("/v1/nexiste-pas");
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Route /v1/nexiste-pas introuvable.");
  });

  it("une erreur inattendue renvoie 500 sans fuite d'information", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    prismaMock.user.count.mockRejectedValue(new Error("détail interne"));
    const res = await request(app)
      .get("/v1/dashboard/stats")
      .set("Authorization", require("../helpers/auth").bearer("ADMIN"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("détail interne");
  });
});
