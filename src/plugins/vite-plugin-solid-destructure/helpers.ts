const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const parse = require('@babel/parser').parse;

const inputPropsVariableName = 'input';
const propsVariableName = 'values';
const requiredImports: string[] = ['splitProps', 'mergeProps'];

export const isJSX = (path: any) => {
  let foundJSXCode = false;

  path.traverse({
    enter(path: any) {
      if (foundJSXCode) {
        path.skip();
        return;
      }

      if (path.type === 'JSXFragment' || path.type === 'JSXElement') {
        foundJSXCode = true;
        path.skip();
      }
    },
  });

  return foundJSXCode;
};

const getImportSpecifier = (name: string) => {
  return {
    type: 'ImportSpecifier',
    imported: {
      name,
      type: 'Identifier',
    },
    importKind: 'value',
    local: {
      name,
      type: 'Identifier',
    },
  };
};

const modifyImports = (source: string, filename: string) => {
  const ast = parse(source, {
    sourceFilename: filename,
    plugins: ['typescript', 'jsx'],
    sourceType: 'module',
  });

  let wasSolidJSImportFound = false;

  traverse(ast, {
    ImportDeclaration(path: any) {
      if (wasSolidJSImportFound) return;

      const source = path?.node.source.value;

      if (source === 'solid-js') {
        wasSolidJSImportFound = true;

        const bindings = Object.keys(path.parentPath.scope.bindings);
        const elapsedImports = requiredImports.filter(
          (name) => !bindings.includes(name)
        );

        path.node.specifiers = [
          ...path.node.specifiers,
          ...elapsedImports.map(getImportSpecifier),
        ];
        path.skip();
      }
    },
  });

  if (!wasSolidJSImportFound) {
    ast.program.body = [
      {
        type: 'ImportDeclaration',
        importKind: 'value',
        specifiers: requiredImports.map(getImportSpecifier),
        source: {
          type: 'StringLiteral',
          extra: { rawValue: 'solid-js', raw: "'solid-js'" },
          value: 'solid-js',
        },
      },
    ].concat(ast.program.body);
  }

  const output = generate(ast, source);

  return output.code;
};

export const mapProps = (source: string, filename: string) => {
  const ast = parse(source, {
    sourceFilename: filename,
    plugins: ['typescript', 'jsx'],
    sourceType: 'module',
  });

  let wasPropsMapped = false;

  traverse(ast, {
    FunctionDeclaration(path: any) {
      if (!isJSX(path)) return;

      if (
        path.node.params.length === 0 ||
        path.node.params[0].type === 'Identifier'
      ) {
        return;
      }

      wasPropsMapped = modifyFunction(path.node, ast);
      path.skip();
    },
    VariableDeclaration(path: any) {
      const func = path.node.declarations[0].init;

      if (func?.type !== 'ArrowFunctionExpression') return;

      if (!isJSX(path)) return;

      wasPropsMapped = modifyFunction(func, ast);
      path.skip();
    },
  });

  const output = generate(ast, source);

  if (!wasPropsMapped) return output.code;

  const code = modifyImports(output.code, filename);
  return code;
};

const modifyFunction = (func: any, parent: any) => {
  let restPropName = null;

  // No need to run transform function
  if (func.params.length === 0 || func.params[0].type === 'Identifier') {
    return false;
  }

  const props: { name: string; value?: any; type?: string }[] =
    func.params[0].properties
      .map((prop: any) => {
        const { value } = prop;
        const type = value?.type;

        if (type === undefined) {
          if (prop?.type === 'RestElement') {
            restPropName = prop.argument.name;
          }
          return null;
        }

        if (type === 'Identifier') {
          return {
            name: value.name,
          };
        } else if (type === 'AssignmentPattern') {
          return {
            name: value.left.name,
            value: value.right.value,
            type: value.right.type,
          };
        }
      })
      .filter((i: any) => i !== null);

  const propsList = props.map(({ name }) => name);
  const propsWithDefaultValue = props.filter(
    ({ value }) => value !== undefined
  );

  func.params[0] = {
    type: 'Identifier',
    name: inputPropsVariableName,
  };

  traverse(
    func.body,
    {
      enter(path: any) {
        const node = path.node;
        if (node.type === 'MemberExpression') {
          path.skip();
          return;
        }

        if (node.type !== 'Identifier') return;
        if (!propsList.includes(node.name)) return;

        const nextNode = {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: propsVariableName,
          },
          computed: false,
          property: {
            type: 'Identifier',
            name: node.name,
          },
        };

        path.replaceWith(nextNode);
      },
    },
    func,
    parent
  );

  const splitPropsOutput = [
    {
      type: 'Identifier',
      name: propsVariableName,
    },
  ];

  if (restPropName) {
    splitPropsOutput[1] = {
      type: 'Identifier',
      name: restPropName,
    };
  }

  let body = func.body.body;

  body = [
    {
      type: 'VariableDeclaration',
      declarations: [
        {
          type: 'VariableDeclarator',
          id: {
            type: 'ArrayPattern',
            elements: splitPropsOutput,
          },
          init: {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: 'splitProps',
            },
            arguments: [
              {
                type: 'Identifier',
                name: 'input',
              },
              {
                type: 'ArrayExpression',
                elements: props.map(({ name }) => ({
                  type: 'StringLiteral',
                  value: name,
                })),
              },
            ],
          },
        },
      ],
      kind: 'let',
    },
    {
      type: 'ExpressionStatement',
      expression: {
        type: 'AssignmentExpression',
        operator: '=',
        left: {
          type: 'Identifier',
          name: propsVariableName,
        },
        right: {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: 'mergeProps',
          },
          arguments: [
            {
              type: 'ObjectExpression',
              properties: propsWithDefaultValue.map(
                ({ name, value, type }) => ({
                  type: 'ObjectProperty',
                  method: false,
                  key: {
                    type: 'Identifier',
                    name,
                  },
                  computed: false,
                  shorthand: false,
                  value: {
                    type,
                    value,
                  },
                })
              ),
            },
            {
              type: 'Identifier',
              name: propsVariableName,
            },
          ],
        },
      },
    },
    ...body,
  ];

  func.body.body = body;

  return true;
};
