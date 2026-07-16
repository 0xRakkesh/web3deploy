import { Box, Text } from 'ink';

export interface DashboardProps {
  framework: string;
  packageManager: string;
  status: string;
  progressPercent: number; // 0 to 100
  logs: string[];
}

export function Dashboard({ framework, packageManager, status, progressPercent, logs }: DashboardProps) {
  const barWidth = 20;
  const filledWidth = Math.round((progressPercent / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const progressBar = '█'.repeat(Math.max(0, filledWidth)) + '░'.repeat(Math.max(0, emptyWidth));

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box borderStyle="round" borderColor="gray" flexDirection="column" width={50}>

        <Box paddingX={1} paddingY={1} flexDirection="column" gap={1}>
          <Box>
            <Box width={12}><Text>Framework</Text></Box>
            <Text>: {framework}</Text>
          </Box>
          <Box>
            <Box width={12}><Text>Package</Text></Box>
            <Text>: {packageManager}</Text>
          </Box>
          <Box>
            <Box width={12}><Text>Status</Text></Box>
            <Text color={status === 'Done' ? 'green' : 'yellow'}>: {status}</Text>
          </Box>
          {(progressPercent > 0 || status === 'Uploading') && (
            <Box>
              <Box width={12}><Text>Progress</Text></Box>
              <Text>: {progressBar} {Math.round(progressPercent)}%</Text>
            </Box>
          )}
        </Box>
      </Box>

      {logs.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Box marginBottom={1}>
            <Text backgroundColor="cyan" color="white" bold> BUILD LOGS </Text>
          </Box>
          <Box flexDirection="column">
            {logs.map((log, index) => (
              <Text key={index} color="gray">
                {log.toLowerCase().includes('error') || log.toLowerCase().includes('fail') ? (
                  <Text color="red">✗ </Text>
                ) : (
                  <Text color="green">✓ </Text>
                )}
                {log}
              </Text>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
