import { bootstrapSystem } from '../src/bootstrap/seedData';

beforeAll(async () => {
  await bootstrapSystem();
});
