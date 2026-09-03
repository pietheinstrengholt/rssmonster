import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  closeEmailTransport: vi.fn(),
  createMailService: vi.fn(),
  getEmailConfiguration: vi.fn(),
  getEmailConfigurationStatus: vi.fn(),
  isEmailEnabled: vi.fn(),
  userFindByPk: vi.fn(),
  verifyEmailTransport: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: { User: { findByPk: mocked.userFindByPk } }
}));

vi.mock('../../config/email.js', () => ({
  getEmailConfiguration: mocked.getEmailConfiguration,
  getEmailConfigurationStatus: mocked.getEmailConfigurationStatus,
  isEmailEnabled: mocked.isEmailEnabled
}));

vi.mock('../../services/email/emailService.js', () => ({
  createMailService: mocked.createMailService
}));

const controller = (await import('../../controllers/emailAdministration.js')).default;

const createResponse = () => {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
};

describe('email administration controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocked.userFindByPk.mockResolvedValue({ role: 'admin' });
    mocked.getEmailConfigurationStatus.mockReturnValue({
      configured: true,
      enabled: true
    });
    mocked.getEmailConfiguration.mockReturnValue({ enabled: true });
    mocked.isEmailEnabled.mockReturnValue(true);
    mocked.verifyEmailTransport.mockResolvedValue({ enabled: true, verified: true });
    mocked.closeEmailTransport.mockResolvedValue(undefined);
    mocked.createMailService.mockReturnValue({
      closeEmailTransport: mocked.closeEmailTransport,
      verifyEmailTransport: mocked.verifyEmailTransport
    });
  });

  it('returns only safe configuration status to administrators', async () => {
    const response = createResponse();

    await controller.getConfigurationStatus({ userData: { userId: 1 } }, response);

    expect(mocked.userFindByPk).toHaveBeenCalledWith(1, { attributes: ['role'] });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ configured: true, enabled: true });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('password');
  });

  it('rejects configuration and connectivity access for non-administrators', async () => {
    mocked.userFindByPk.mockResolvedValue({ role: 'user' });
    const statusResponse = createResponse();
    const testResponse = createResponse();

    await controller.getConfigurationStatus({ userData: { userId: 2 } }, statusResponse);
    await controller.testSmtpConnectivity({ userData: { userId: 2 } }, testResponse);

    expect(statusResponse.status).toHaveBeenCalledWith(403);
    expect(testResponse.status).toHaveBeenCalledWith(403);
    expect(mocked.getEmailConfigurationStatus).not.toHaveBeenCalled();
    expect(mocked.createMailService).not.toHaveBeenCalled();
  });

  it('tests and closes the configured SMTP transport', async () => {
    const response = createResponse();

    await controller.testSmtpConnectivity({ userData: { userId: 1 } }, response);

    expect(mocked.verifyEmailTransport).toHaveBeenCalledOnce();
    expect(mocked.closeEmailTransport).toHaveBeenCalledOnce();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      verified: true,
      message: 'SMTP connection succeeded.'
    });
  });

  it('does not open a transport while email delivery is disabled', async () => {
    mocked.isEmailEnabled.mockReturnValue(false);
    const response = createResponse();

    await controller.testSmtpConnectivity({ userData: { userId: 1 } }, response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(mocked.createMailService).not.toHaveBeenCalled();
  });

  it('returns a safe failure without exposing SMTP error details', async () => {
    mocked.verifyEmailTransport.mockRejectedValue(
      Object.assign(new Error('smtp-user secret-password'), { code: 'EAUTH' })
    );
    const response = createResponse();

    await controller.testSmtpConnectivity({ userData: { userId: 1 } }, response);

    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.json).toHaveBeenCalledWith({
      verified: false,
      message: 'Could not connect to the configured SMTP server.'
    });
    expect(console.error).toHaveBeenCalledWith('SMTP connectivity test failed:', 'EAUTH');
    expect(mocked.closeEmailTransport).toHaveBeenCalledOnce();
  });
});
