/*
   Xpress Insight vdlx-datagrid
   =============================

   file vdlx-datagrid/data-transform.js
   ```````````````````````
   vdlx-datagrid data transform.

    (c) Copyright 2019 Fair Isaac Corporation

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
 */
import perf from '../performance-measurement';

import { _ } from '../globals';
const DataUtils = insightModules.load('utils/data-utils');
const createSparseData = insightModules.load('components/table/create-sparse-data');
const createDenseData = insightModules.load('components/table/create-dense-data');
const SelectOptions = insightModules.load('components/autotable-select-options');

export const getAllColumnIndices = _.curry((schema, columnOptions) => {
    return _.map(columnOptions, function (option) {
        return schema.getEntity(option.name).getIndexSets();
    });
}, 2);

const getIndexPosns = DataUtils.getIndexPosns;

/**
 * @typedef {{name: string, position: number}} SetNameAndPosition 
 */

/** @returns {SetNameAndPosition[]} */
export const getDisplayIndices = (columnIndices, columnOptions) => {
    var setCount = {};
    var numColumns = columnIndices.length;

    for (var i = 0; i < numColumns; i++) {
        const indices = columnIndices[i], options = columnOptions[i];
        const setPosns = getIndexPosns(indices);
        indices.forEach(function (setName, i) {
            const setPosn = setPosns[i];
            if (DataUtils.getFilterValue(options.filters, setName, setPosn) == null) {
                // i.e. if there is no filter, then this index is to be used
                const key = { name: setName, position: setPosn }, keyJson = JSON.stringify(key);
                setCount[keyJson] = (setCount[keyJson] || 0) + 1;
            }
        });
    }

    return _(setCount)
        .pick(function (count) {
            return count === numColumns;
        })
        .keys()
        .map(function (k) {
            return JSON.parse(k);
        })
        .value();
}

// Build a key from the index set columns of a row. This may be partial, if not all index sets are displayed in the row
export const getPartialExposedKey = (setNameAndPosns, rowData) => 
    // Assume index columns always start at the beginning of the rowData array
    rowData.slice(0, setNameAndPosns.length);

export const generateCompositeKey = function (setValues, setNameAndPosns, arrayIndices, arrayOptions) {
    const setPosns = getIndexPosns(arrayIndices);
    return arrayIndices.map(function (setName, i) {
        const setPosn = setPosns[i];
        const setIndex = _.findIndex(setNameAndPosns, { name: setName, position: setPosn });
        const filterValue = DataUtils.getFilterValue(arrayOptions.filters, setName, setPosn);
        if (setIndex !== -1) {
            return setValues[setIndex];
        } else if (filterValue != null) {
            return filterValue;
        } else {
            throw Error('Cannot generate table with incomplete index configuration. Missing indices: ' +
                setName + ' for entity: ' + arrayOptions.name);
        }
    });
};

export const createGenerateCompositeKey = (setNameAndPosns) => {
    const setNameAndPosnsIndices = _.reduce(setNameAndPosns, (acc, setNameAndPosn, i) => _.set(acc, [setNameAndPosn.name, setNameAndPosn.position], i), {});

    return (setValues, __, arrayIndices, arrayOptions) => {
        if (_.isEmpty(arrayOptions.filters)) {
            return setValues;
        }
        const setPosns = getIndexPosns(arrayIndices);
        const result = [];
        for(let i = 0; i < arrayIndices.length; i++) {
            const setName = arrayIndices[i];
            const setPosn = setPosns[i];
            const setIndex = _.get(setNameAndPosnsIndices, [ setName, setPosn ]);
            if (setIndex !== undefined) {
                result.push(setValues[setIndex]);
            } else {
                const filterValue = DataUtils.getFilterValue(arrayOptions.filters, setName, setPosn);
                if (filterValue != null) {
                    result.push(filterValue);
                } else {
                    throw Error('Cannot generate table with incomplete index configuration. Missing indices: ' +
                        setName + ' for entity: ' + arrayOptions.name);
                }
            }
        }

        return result;
    };
}

const isSparse = (sets, arrays) => {
    const totalPossibleKeys = _.reduce(sets, function (memo, set) {
        return memo * set.length;
    }, 1);

    const totalCountOfArrayValues = _.reduce(arrays, function (memo, insightArray) {
        return memo + insightArray.size();
    }, 0);

    return (totalPossibleKeys * arrays.length > ((totalCountOfArrayValues * Math.log(totalCountOfArrayValues)) || 0));
};

export default (allColumnIndices, columns, columnOptions, setNamePosnsAndOptions, scenariosData, rowFilter) => {

    var defaultScenario = scenariosData.defaultScenario;
    const indexScenarios = _.uniq(_.map(_.map(columnOptions, 'id'), id =>
        _.get(scenariosData.scenarios, id, defaultScenario)
    ));

    const arrayIds = _.map(columnOptions, 'id');
    const setIds = _.map(setNamePosnsAndOptions, 'options.id');

    const arrays = _.filter(_.map(columnOptions, column => {
        try {
            return _.get(scenariosData.scenarios, column.id, defaultScenario).getArray(column.name)
        } catch (err) {
            return undefined;
        } 
    }));

    const sets = _.map(setNamePosnsAndOptions, setNameAndPosn => {
        return _(indexScenarios)
            .map(function (scenario) {
                return scenario.getSet(setNameAndPosn.name);
            })
            .flatten()
            .uniq()
            .value();
    });

    const schema = insight.getView().getProject().getModelSchema();

    const allSetValues = _.map(setNamePosnsAndOptions, (setNamePosnAndOption, i) => {
        return SelectOptions.generateSelectOptions(schema, indexScenarios, setNamePosnAndOption.name, sets[i]);
    });

    const createRow = _.partial(_.zipObject, setIds.concat(arrayIds));

    if (_.isEmpty(arrays)) {
        return {
            data: [],
            allSetValues: allSetValues
        };
    }

    let data;
    if (isSparse(sets, arrays)) {
        // assume O(nlogn)
        data = createSparseData(arrays, setNamePosnsAndOptions, allColumnIndices, columnOptions, columns);
    } else {
        data = perf('PERF: dense data', () =>
            createDenseData(
                sets,
                arrays,
                setNamePosnsAndOptions,
                allColumnIndices,
                columnOptions,
                createGenerateCompositeKey(setNamePosnsAndOptions)
            )
        );
    }

    // row filtering
    if (_.isFunction(rowFilter)) {
        data = _.filter(data, (rowData) => {
            return rowFilter(
                rowData,
                getPartialExposedKey(setNamePosnsAndOptions, rowData)
            );
        });
    }

    return {data: _.map(data, createRow), allSetValues: allSetValues};
};