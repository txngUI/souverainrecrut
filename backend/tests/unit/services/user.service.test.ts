jest.mock("../../../src/config/prisma", () => require("../../helpers/prisma-mock"));

import bcrypt from "bcrypt";

import { UserService } from "../../../src/services/user.service";
import { prismaMock } from "../../helpers/prisma-mock";

const service = new UserService();
const user = { id: "u1", email: "ada@mail.com" };

beforeEach(() => jest.resetAllMocks());

describe("UserService", () => {
  it("getAll retourne items et total", async () => {
    prismaMock.user.findMany.mockResolvedValue([user]);
    prismaMock.user.count.mockResolvedValue(1);

    await expect(service.getAll(0, 10)).resolves.toEqual({ items: [user], total: 1 });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
  });

  it("getAll utilise skip=0 / take=10 par défaut", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    await service.getAll();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
  });

  it("getById lève 404 si l'utilisateur n'existe pas", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.getById("nope")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("getProfile lève 404 si l'utilisateur n'existe pas", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.getProfile("nope")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("getProfile ne sélectionne pas le mot de passe", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);

    await expect(service.getProfile("u1")).resolves.toEqual(user);
    const { select } = prismaMock.user.findUnique.mock.calls[0][0];
    expect(select.password).toBeUndefined();
  });

  it("create refuse un email déjà utilisé (409)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);

    await expect(
      service.create({ firstName: "A", lastName: "B", email: user.email, password: "x" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("create hache le mot de passe avant enregistrement", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(({ data }) => Promise.resolve(data));

    const created = await service.create({
      firstName: "A",
      lastName: "B",
      email: "new@mail.com",
      password: "Password123!",
    });

    expect(created.password).not.toBe("Password123!");
    expect(await bcrypt.compare("Password123!", created.password)).toBe(true);
  });

  it("update et delete vérifient l'existence puis délèguent au repository", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.user.update.mockResolvedValue({ ...user, firstName: "Z" });
    prismaMock.user.delete.mockResolvedValue(user);

    await expect(service.update("u1", { firstName: "Z" })).resolves.toMatchObject({
      firstName: "Z",
    });
    await expect(service.delete("u1")).resolves.toEqual(user);
  });

  it("update lève 404 sur un utilisateur inexistant", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.update("nope", {})).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
