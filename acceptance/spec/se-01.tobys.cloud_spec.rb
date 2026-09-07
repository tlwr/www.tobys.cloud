require_relative 'spec_helper'

# IPv6-only anycast (2a0e:97c0:450::) on se-01. Failure here means BGP or
# the Caddy job (nomad/se-01-web.hcl) is down.
describe 'se-01.tobys.cloud', type: :feature do
  def base_url
    'https://se-01.tobys.cloud'
  end

  it 'answers HTTPS over the anycast prefix' do
    page = agent.get(base_url + '/')
    expect(page.code.to_i).to eq(200)
    expect(page.body).to match(/^ok se-01\.tobys\.cloud se-01\n?$/)
    expect(page.response['x-backend']).to eq('se-01')
  end
end
