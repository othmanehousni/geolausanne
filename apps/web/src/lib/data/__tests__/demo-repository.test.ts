// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "@/test/memory-storage";
import { DemoRepository } from "../demo-repository";
import { REMOVAL_MAX_SCORE, REMOVAL_MIN_DOWNVOTES } from "../rules";
import { BackendError, type NewPlaceInput } from "../types";

const FLON = { lon: 6.6285, lat: 46.521 };

function input(overrides: Partial<NewPlaceInput> = {}): NewPlaceInput {
  return {
    name: "Kebab du Flon",
    ...FLON,
    category: "fast_food",
    cuisine: ["kebab"],
    elevation: 480,
    address: null,
    website: null,
    phone: null,
    opening_hours: null,
    description: null,
    halal_level: "full",
    certification: "community",
    certifier: null,
    serves_alcohol: false,
    ...overrides,
  };
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(BackendError);
  await expect(p).rejects.toMatchObject({ code });
}

let storage: MemoryStorage;
let repo: DemoRepository;

beforeEach(() => {
  storage = new MemoryStorage();
  repo = new DemoRepository(storage);
});

describe("DemoRepository", () => {
  it("starts with the OpenStreetMap halal places and requires sign-in to write", async () => {
    const all = await repo.placesInBounds({ west: 6.5, south: 46.45, east: 6.8, north: 46.6 });
    expect(all.length).toBeGreaterThan(5);
    await expectCode(repo.createPlace(input()), "not_authenticated");
  });

  it("gives new members a pseudonymous display name", async () => {
    await repo.auth.signInWithEmail("othmane.private@example.ch", "/");
    const profile = await repo.auth.profile();
    expect(profile?.display_name).toMatch(/^member-[0-9a-f]{6}$/);
  });

  it("validates new places and finds duplicates nearby", async () => {
    await repo.auth.signInWithEmail("alice@example.ch", "/");
    await expectCode(repo.createPlace(input({ name: " x " })), "invalid_name");
    await expectCode(repo.createPlace(input({ lon: 7.4, lat: 46.9 })), "outside_service_area");
    const p = await repo.createPlace(input());
    expect(p).toMatchObject({ name: "Kebab du Flon", is_mine: true, score: 0, status: "active" });
    await expectCode(repo.createPlace(input({ name: "Kebab Du Flon", lon: FLON.lon + 0.0001 })), "duplicate_place");
    // same spot but a clearly different business is fine
    await expect(repo.createPlace(input({ name: "Boucherie Atlas" }))).resolves.toMatchObject({ name: "Boucherie Atlas" });
  });

  it("removes a spot after enough downvotes and lets a moderator restore it", async () => {
    await repo.auth.signInWithEmail("owner@example.ch", "/");
    const p = await repo.createPlace(input());
    await expectCode(repo.vote(p.id, -1), "own_place");

    for (let i = 0; i < REMOVAL_MIN_DOWNVOTES; i++) {
      await repo.auth.signInWithEmail(`voter${i}@example.ch`, "/");
      const after = await repo.vote(p.id, -1);
      const removedNow = after.downvotes >= REMOVAL_MIN_DOWNVOTES && after.score <= REMOVAL_MAX_SCORE;
      expect(after.status).toBe(removedNow ? "removed" : "active");
    }
    expect(await repo.place(p.id)).toBeNull(); // removed spots disappear for members

    await repo.auth.signInWithEmail("mod@example.ch", "/");
    const removed = await repo.mod.places("removed");
    expect(removed.map((x) => x.id)).toContain(p.id);
    const restored = await repo.mod.setPlaceStatus(p.id, "active", "valid listing");
    expect(restored.status).toBe("active");

    // a restored spot is locked against new automatic removal
    await repo.auth.signInWithEmail("voter-late@example.ch", "/");
    expect((await repo.vote(p.id, -1)).status).toBe("active");
    await repo.auth.signInWithEmail("mod@example.ch", "/");
    const log = await repo.mod.events();
    expect(log.map((e) => e.action)).toEqual(expect.arrayContaining(["auto_remove", "place_active"]));
  });

  it("changing or withdrawing a vote updates the counts", async () => {
    await repo.auth.signInWithEmail("owner@example.ch", "/");
    const p = await repo.createPlace(input());
    await repo.auth.signInWithEmail("bob@example.ch", "/");
    expect((await repo.vote(p.id, 1)).score).toBe(1);
    expect((await repo.vote(p.id, -1)).score).toBe(-1);
    const cleared = await repo.vote(p.id, 0);
    expect(cleared).toMatchObject({ score: 0, upvotes: 0, downvotes: 0, my_vote: null });
  });

  it("reviews need a method when confirming halal status and count as confirmations", async () => {
    await repo.auth.signInWithEmail("owner@example.ch", "/");
    const p = await repo.createPlace(input());
    await repo.auth.signInWithEmail("carol@example.ch", "/");
    await expectCode(
      repo.upsertReview({ placeId: p.id, rating: 5, body: "", halalConfirmed: true, confirmationMethod: null }),
      "confirmation_method_required",
    );
    await repo.upsertReview({ placeId: p.id, rating: 4, body: "Certificate on the wall", halalConfirmed: true, confirmationMethod: "certificate" });
    const fresh = await repo.place(p.id);
    expect(fresh).toMatchObject({ review_count: 1, avg_rating: 4, confirmations: 1 });
    const [mine] = await repo.reviews(p.id);
    expect(mine).toMatchObject({ is_mine: true, halal_confirmed: true, confirmation_method: "certificate" });
  });

  it("only moderators reach the moderation API", async () => {
    await repo.auth.signInWithEmail("alice@example.ch", "/");
    await expectCode(repo.mod.reports(), "forbidden");
  });

  it("persists state in storage", async () => {
    await repo.auth.signInWithEmail("alice@example.ch", "/");
    const p = await repo.createPlace(input());
    const again = new DemoRepository(storage);
    expect((await again.place(p.id))?.name).toBe("Kebab du Flon");
  });
});
