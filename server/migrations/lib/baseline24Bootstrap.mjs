// Historical fresh installs receive this one row. The optional full taxonomy and
// official-source seed commands remain separate; never bootstrap users or secrets.
export const bootstrapBaseline24 = async (queryInterface, options = {}) => {
  const now = new Date();
  await queryInterface.bulkInsert('island_taxonomy', [{
    identity: 'technology-and-computing-c-plus-plus',
    displayName: 'C++',
    categoryName: 'Technology & Computing',
    description: 'C++ as a computing technology, engineering practice, software field, or digital product category.',
    vector: null,
    embedding_model: null,
    status: 'active',
    createdAt: now,
    updatedAt: now
  }], options);
};
