import { useEffect, useState } from 'react';
import { FulfilledPromiseResult, processPromiseResults } from 'shared/components/helpers/promises';
import { Databases } from 'shared/core';
import { Kubernetes } from '../Kubernetes/Kubernetes.types';
import {
  DBCluster, DBClusterPayload, DBClusterStatus, GetDBClustersAction,
} from './DBCluster.types';
import { isClusterChanging } from './DBCluster.utils';
import { DBClusterServiceFactory } from './DBClusterService.factory';

const RECHECK_INTERVAL = 30000;
const DATABASES = [Databases.mysql, Databases.mongodb];

export const useDBClusters = (kubernetes: Kubernetes[]): [DBCluster[], GetDBClustersAction, boolean] => {
  const [dbClusters, setDBClusters] = useState<DBCluster[]>([]);
  const [loading, setLoading] = useState(false);
  let timer: NodeJS.Timeout;

  const getDBClusters = async (triggerLoading = true) => {
    if (triggerLoading) {
      setLoading(true);
    }

    try {
      const requests = DATABASES.map((database) => getClusters(kubernetes, database));
      const results = await Promise.all(requests);
      const clustersList = results.reduce((acc, r) => acc.concat(r), []);

      setDBClusters(clustersList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getDBClusters();
  }, []);

  useEffect(() => {
    // clear timer to prevent parallel requests when get is called from outside hook
    if (timer) {
      clearTimeout(timer);
    }

    // if there are clusters changing, recheck
    if (dbClusters.find((cluster) => isClusterChanging(cluster))) {
      timer = setTimeout(() => getDBClusters(false), RECHECK_INTERVAL);
    }
  }, [dbClusters]);

  return [dbClusters, getDBClusters, loading];
};

const getClusters = async (kubernetes: Kubernetes[], databaseType: Databases): Promise<DBCluster[]> => {
  const dbClusterService = DBClusterServiceFactory.newDBClusterService(databaseType);
  const requests = kubernetes.map(dbClusterService.getDBClusters);
  const results = await processPromiseResults(requests);

  const clustersList: DBCluster[] = results.reduce((acc: DBCluster[], r, index) => {
    if (r.status !== 'fulfilled') {
      return acc;
    }

    const clusters2: DBClusterPayload[] = (r as FulfilledPromiseResult).value?.clusters ?? [];

    console.log(clusters2);
    // @ts-ignore
    const clusters: DBClusterPayload[] = [
      {
        kubernetes_cluster_name: 'string',
        name: 'Testerok',
        state: DBClusterStatus.ready,
        operation: {
          progress: 3,
          message: 'test',
        },
        params: {
          cluster_size: 1,
          pxc: {
            compute_resources: {
              cpu_m: 10000,
              memory_bytes: 2000000000000,
              disk_size: 25,
            },
          },
        },
      },
    ];

    // eslint-disable-next-line max-len
    const resultClusters = clusters.map((cluster) => dbClusterService.toModel(cluster, kubernetes[index].kubernetesClusterName, databaseType));

    return acc.concat(resultClusters);
  }, []);

  return clustersList;
};
