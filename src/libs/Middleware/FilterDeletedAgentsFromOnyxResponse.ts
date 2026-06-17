import {getAgentDeletionTombstones, stripTombstonedAgentsFromOnyxUpdates} from '@libs/AgentUtils';
import type {Middleware} from '@libs/Request';
import type {AnyOnyxUpdate} from '@src/types/onyx/Request';

/**
 * Stale OpenAgentsPage responses and other server updates can merge deleted agents back into Onyx.
 * Strip those updates before SaveResponseInOnyx applies them so tombstoned agents stay removed.
 */
const filterDeletedAgentsFromOnyxResponse: Middleware = (requestResponse) =>
    requestResponse.then((response) => {
        if (!response?.onyxData?.length) {
            return response;
        }

        const deletionTombstones = getAgentDeletionTombstones();
        if (!deletionTombstones) {
            return response;
        }

        return {
            ...response,
            onyxData: stripTombstonedAgentsFromOnyxUpdates(response.onyxData as AnyOnyxUpdate[], deletionTombstones),
        };
    });

export default filterDeletedAgentsFromOnyxResponse;
