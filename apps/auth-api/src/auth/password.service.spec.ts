import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();
  const plain = 'correct-horse-battery';

  it('hashes to an argon2id value different from the plaintext', async () => {
    const hash = await service.hash(plain);
    expect(hash).not.toBe(plain);
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies a correct password', async () => {
    const hash = await service.hash(plain);
    await expect(service.verify(hash, plain)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash(plain);
    await expect(service.verify(hash, 'wrong-password')).resolves.toBe(false);
  });
});
