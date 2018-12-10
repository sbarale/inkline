import * as validators from "inkline/validators";

export class FormBuilder {
    defaultFormState = {
        touched: false,
        untouched: true,
        dirty: false,
        pristine: true,
        invalid: false,
        valid: true,
        errors: {}
    };

    defaultFormControlState = {
        value: '',
        validateOn: 'input'
    };

    validators = validators;

    /**
     * If grouped, return a new form group. Otherwise, return a form control
     *
     * @param isGroup
     * @param nameNesting
     * @param schema
     * @returns {*}
     */
    factory(nameNesting, schema, isGroup) {
        return isGroup ?
            this.form(nameNesting, schema) :
            this.formControl(nameNesting, schema);
    }

    /**
     * Creates a form control schema
     *
     * @param nameNesting
     * @param schema
     * @returns {{
     *      $name: string,
     *      $validate: (function(*=): {valid: boolean, errors: {length: number}}),
     *      value: string,
     *      validateOn: string,
     *      touched: boolean,
     *      untouched: boolean,
     *      dirty: boolean,
     *      pristine: boolean,
     *      invalid: boolean,
     *      valid: boolean,
     *      errors: {}
     * }}
     */
    formControl(nameNesting=[], schema) {
        const $name = nameNesting.join('.');

        // Set all validators as enabled by default
        for (let validator of (schema.validators || [])) {
            if (!validator.hasOwnProperty('enabled')) {
                validator.enabled = true;
            }
        }

        /**
         * Validate the current value by performing all the specified validation functions on it
         *
         * @param value
         * @param options
         * @returns {{valid: boolean, errors: {length: number}}}
         */
        const $validate = (value, options) => {
            let valid = true;
            let errors = {
                length: 0
            };

            for (let validator of (schema.validators || [])) {
                if (!this.validators[validator.rule]) {
                    throw new Error(`Invalid validation rule '${validator.rule}' provided.`);
                }

                // Validator enabled state can be a function
                const validatorEnabled = typeof validator.enabled === 'function' ?
                    validator.enabled() :
                    validator.enabled;

                // Validator rule gets called with value, validator options and root schema options
                if (validatorEnabled && !validators[validator.rule](value, validator, options)) {
                    errors[validator.rule] = validator.message || true;
                    errors.length += 1;
                    valid = false;
                }
            }

            return {
                valid,
                errors
            }
        };

        return {
            $name,
            $validate,
            ...this.defaultFormControlState,
            ...this.defaultFormState,
            ...schema
        }
    }

    /**
     * Creates a form schema by going through all the fields
     *
     * @param nameNesting
     * @param schema
     * @returns {{
     *      $name: string,
     *      touched: boolean,
     *      untouched: boolean,
     *      dirty: boolean,
     *      pristine: boolean,
     *      invalid: boolean,
     *      valid: boolean,
     *      errors: {}
     * }}
     */
    form(nameNesting=[], schema) {
        const $name = nameNesting.join('.');

        // Clone the provided schema to make sure we're working on a clean copy
        // without modifying the provided arguments.
        if (schema.constructor === Array) {
            schema = schema.slice(0);
        } else {
            schema = { ...schema };
        }

        Object.keys(schema).forEach((name) => {
            if (!schema.hasOwnProperty(name)) { return; }

            const schemaHasFormControlProperties = schema[name].hasOwnProperty('validators') ||
                schema[name].hasOwnProperty('value');
            const schemaIsEmptyObject = Object.keys(schema[name]).length === 0;
            const schemaIsArray = schema[name].constructor === Array;

            // Verify if schema is a form control or a form group. Form controls can be empty objects, can have either
            // a 'validators' or a 'value' field. Form groups are arrays or have multiple user-defined keys
            schema[name] = this.factory(nameNesting.concat([name]), schema[name],
                !(schemaHasFormControlProperties || schemaIsEmptyObject) || schemaIsArray);
        });

        // Set schema name
        schema.$name = $name;

        // Add schema state properties. When handling array form groups, we add the schema fields as
        // custom array properties in order to keep the array iterator intact
        Object.keys(this.defaultFormState)
            .forEach((property) => schema[property] = this.defaultFormState[property]);


        if (schema.constructor === Array) {

            /**
             * Push an item into the Array schema
             *
             * @param item
             * @param options
             */
            schema.$push = (item, options={}) => schema
                .push(this.factory(nameNesting.concat([schema.length]), item, options.group));

            /**
             * Add an item into the Array schema at the given index, after removing n elements
             *
             * @param start
             * @param deleteCount
             * @param item
             * @param options
             */
            schema.$splice = (start, deleteCount, item, options={}) => {
                schema = schema.splice(
                    start, deleteCount, this.factory(nameNesting.concat([start]), item, options.group));

                for (let index = start + 1; index < schema.length; index += 1) {
                    schema[index].$name = schema[index].$name.replace(/[0-9]+$/, index);
                }
            };

            return schema;
        }

        /**
         * Set a field with the given name and definition on the schema
         *
         * @param name
         * @param item
         * @param options
         */
        schema.$set = (name, item, options={}) => {
            schema[name] = this.factory(
                nameNesting.concat([name]), item, options.group)
        };

        return schema;
    }
}