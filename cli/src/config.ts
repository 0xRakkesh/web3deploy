import Conf from 'conf';

type ConfigSchema = {
  token: string | undefined;
};

// Initialize config for w3deploy CLI
export const config = new Conf<ConfigSchema>({
  projectName: 'w3deploy-cli',
  defaults: {
    token: undefined,
  },
});
