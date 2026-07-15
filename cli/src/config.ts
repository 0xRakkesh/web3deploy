import Conf from 'conf';

type ConfigSchema = {
  token: string | undefined;
};

// Initialize config for web3deploy CLI
export const config = new Conf<ConfigSchema>({
  projectName: 'web3deploy-cli',
  defaults: {
    token: undefined,
  },
});
