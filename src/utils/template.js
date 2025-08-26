import * as fs from 'fs'
import * as path from 'path'
import Handlebars from 'handlebars'
import * as core from '@actions/core'

/**
 * Generate content from a template using Handlebars
 *
 * @param {string} templateName - The name of the template file (without extension)
 * @param {Object} data - Data to be used for template rendering
 * @returns {Promise<string>} The rendered template content
 */
export async function generateFromTemplate(templateName, data) {
  try {
    // Get absolute path to template file
    const templatePath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '../templates',
      `${templateName}.hbs`
    )

    // Read the template file
    const templateContent = await fs.promises.readFile(templatePath, 'utf8')

    // Compile the template
    const template = Handlebars.compile(templateContent)

    // Render the template with the provided data
    const rendered = template(data)

    return rendered
  } catch (error) {
    core.debug(`Error generating template: ${error.message}`)
    throw new Error(
      `Failed to generate template '${templateName}': ${error.message}`
    )
  }
}
