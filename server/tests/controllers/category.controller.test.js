import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  categoryCreate: vi.fn(),
  categoryFindAll: vi.fn(),
  categoryFindOne: vi.fn(),
  feedDestroy: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Category: {
      create: mocked.categoryCreate,
      findAll: mocked.categoryFindAll,
      findOne: mocked.categoryFindOne
    },
    Feed: {
      destroy: mocked.feedDestroy
    }
  }
}));

const categoryController = (await import('../../controllers/category.js')).default;

// Builds an authenticated category request with overridable fields.
const createRequest = (overrides = {}) => ({
  userData: { userId: 42 },
  params: { categoryId: '3' },
  body: {},
  ...overrides
});

// Builds the response contract used by category handlers.
const createResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
};

// Creates a category record with controllable mutation methods.
const createCategory = (overrides = {}) => ({
  id: 3,
  name: 'Technology',
  update: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

describe('category controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns categories and their feeds for the authenticated user', async () => {
    const categories = [createCategory()];
    mocked.categoryFindAll.mockResolvedValue(categories);
    const res = createResponse();

    await categoryController.getCategories(createRequest(), res);

    expect(mocked.categoryFindAll).toHaveBeenCalledWith({
      where: { userId: 42 },
      include: [{
        model: expect.any(Object),
        required: true
      }],
      order: [['categoryOrder', 'ASC'], ['name', 'ASC']]
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ categories });
  });

  it('rejects category lists without a user and reports query errors', async () => {
    const unauthorizedRes = createResponse();
    await categoryController.getCategories(
      createRequest({ userData: {} }),
      unauthorizedRes
    );
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    mocked.categoryFindAll.mockRejectedValue(new Error('list failed'));
    const failureRes = createResponse();
    await categoryController.getCategories(createRequest(), failureRes);
    expect(failureRes.status).toHaveBeenCalledWith(500);
    expect(failureRes.json).toHaveBeenCalledWith({
      error: 'list failed'
    });
  });

  it('returns one user-owned category', async () => {
    const category = createCategory();
    mocked.categoryFindOne.mockResolvedValue(category);
    const res = createResponse();

    await categoryController.getCategory(createRequest(), res);

    expect(mocked.categoryFindOne).toHaveBeenCalledWith({
      where: { id: '3', userId: 42 },
      include: [{
        model: expect.any(Object),
        required: true
      }]
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ category });
  });

  it('returns not found for an unavailable category', async () => {
    mocked.categoryFindOne.mockResolvedValue(null);
    const res = createResponse();

    await categoryController.getCategory(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Category not found'
    });
  });

  it('creates a user-owned category with its display metadata', async () => {
    const category = createCategory();
    mocked.categoryCreate.mockResolvedValue(category);
    const res = createResponse();

    await categoryController.addCategory(
      createRequest({
        body: {
          name: 'Technology',
          categoryOrder: 2,
          iconName: 'cpu-fill'
        }
      }),
      res
    );

    expect(mocked.categoryCreate).toHaveBeenCalledWith({
      userId: 42,
      name: 'Technology',
      categoryOrder: 2,
      iconName: 'cpu-fill'
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(category);
  });

  it('updates only a category owned by the authenticated user', async () => {
    const category = createCategory();
    mocked.categoryFindOne.mockResolvedValue(category);
    const res = createResponse();

    await categoryController.updateCategory(
      createRequest({
        body: {
          name: 'Updated',
          categoryOrder: 4,
          iconName: 'newspaper'
        }
      }),
      res
    );

    expect(category.update).toHaveBeenCalledWith({
      name: 'Updated',
      categoryOrder: 4,
      iconName: 'newspaper'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(category);
  });

  it('returns not found when updating a foreign or missing category', async () => {
    mocked.categoryFindOne.mockResolvedValue(null);
    const res = createResponse();

    await categoryController.updateCategory(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Category not found'
    });
  });

  it('deletes category feeds before deleting the owned category', async () => {
    const category = createCategory();
    mocked.categoryFindOne.mockResolvedValue(category);
    mocked.feedDestroy.mockResolvedValue(2);
    const res = createResponse();

    await categoryController.deleteCategory(createRequest(), res);

    expect(mocked.feedDestroy).toHaveBeenCalledWith({
      where: { categoryId: 3 }
    });
    expect(category.destroy).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledOnce();
  });

  it('returns not found without deleting feeds for a missing category', async () => {
    mocked.categoryFindOne.mockResolvedValue(null);
    const res = createResponse();

    await categoryController.deleteCategory(createRequest(), res);

    expect(mocked.feedDestroy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('covers authentication and persistence failures for mutations', async () => {
    const handlers = [
      categoryController.getCategory,
      categoryController.addCategory,
      categoryController.updateCategory,
      categoryController.deleteCategory
    ];

    for (const handler of handlers) {
      const res = createResponse();
      await handler(createRequest({ userData: {} }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    }

    mocked.categoryCreate.mockRejectedValue(new Error('create failed'));
    const createFailureRes = createResponse();
    await categoryController.addCategory(createRequest(), createFailureRes);
    expect(createFailureRes.status).toHaveBeenCalledWith(500);

    mocked.categoryFindOne.mockRejectedValue(new Error('mutation failed'));
    const updateFailureRes = createResponse();
    await categoryController.updateCategory(
      createRequest(),
      updateFailureRes
    );
    expect(updateFailureRes.status).toHaveBeenCalledWith(500);

    const deleteFailureRes = createResponse();
    await categoryController.deleteCategory(
      createRequest(),
      deleteFailureRes
    );
    expect(deleteFailureRes.status).toHaveBeenCalledWith(500);
  });
});
